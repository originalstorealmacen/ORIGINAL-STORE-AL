import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {Buffer} from 'node:buffer';

export const DRIVE_REDIRECT='https://aloriginalstore.online/drive-callback.html';
const SCOPE='https://www.googleapis.com/auth/drive.file';
const PROPERTY='ORIGINAL_STORE_DRIVE_CONNECTION';
const digest=value=>createHash('sha256').update(value).digest();

// Encryption key remains in server secrets, separate from the database backup.
function encryptionKey(env){
  const secret=env('GOOGLE_DRIVE_ENCRYPTION_KEY')||env('ORIGINAL_STORE_DB_SECRET')||env('SUPABASE_SERVICE_ROLE_KEY');
  if(!secret)throw new Error('Servidor pendiente de configuración.');
  return digest('original-store-drive-v1:'+secret);
}
export function sealConnection(connection,env){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(env),iv);
  cipher.setAAD(Buffer.from(DRIVE_REDIRECT));
  const content=Buffer.concat([cipher.update(JSON.stringify(connection),'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),content].map(v=>v.toString('base64url')).join('.');
}
export function readConnection(props,env){
  const value=props.getProperty(PROPERTY);if(!value)return null;
  const [iv,tag,content]=value.split('.').map(v=>Buffer.from(v,'base64url'));
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(env),iv);
  decipher.setAAD(Buffer.from(DRIVE_REDIRECT));decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(content),decipher.final()]).toString('utf8'));
}
export async function driveAction({body,env,props,cache,checkpoint,fetcher,authorize}){
  const action=body.action;
  if(!['drivestatus','drivebegin','drivefinish'].includes(action))return null;
  if(action!=='drivefinish'&&!await authorize())return {ok:false,error:'Inicia sesión con una cuenta administrativa autorizada.'};
  const client=env('GOOGLE_DRIVE_CLIENT_ID'),secret=env('GOOGLE_DRIVE_CLIENT_SECRET');
  if(action==='drivestatus'){
    let connection;try{connection=readConnection(props,env);}catch{return {ok:true,configured:!!(client&&secret),connected:false,reconnect:true};}
    return {ok:true,configured:!!(client&&secret),connected:!!connection,folderName:connection?.folderName||''};
  }
  if(!client||!secret)return {ok:false,error:'Primero configura el cliente de Drive en los secretos de Supabase.'};
  if(action==='drivebegin'){
    const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
    const folderName=String(body.folderName||'Original Store Imágenes').trim().slice(0,100)||'Original Store Imágenes';
    cache.put('drive:'+digest(state).toString('hex'),JSON.stringify({verifier,folderName}),600);
    await checkpoint([]);
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search=new URLSearchParams({client_id:client,redirect_uri:DRIVE_REDIRECT,response_type:'code',scope:SCOPE,access_type:'offline',prompt:'consent',state,code_challenge:digest(verifier).toString('base64url'),code_challenge_method:'S256'}).toString();
    return {ok:true,url:url.href,state};
  }
  if(typeof body.state!=='string'||!/^[-\w]{43}$/.test(body.state))return {ok:false,error:'La autorización caducó. Vuelve a conectar Drive.'};
  const cacheKey='drive:'+digest(body.state).toString('hex'),pending=cache.get(cacheKey);
  if(!pending)return {ok:false,error:'La autorización caducó o ya fue utilizada. Vuelve a conectar Drive.'};
  // Claim once using the database revision lock before exchanging the OAuth code.
  cache.remove(cacheKey);await checkpoint([]);
  if(body.error||typeof body.code!=='string'||body.code.length>4096)return {ok:false,error:'No se autorizó la conexión. Puedes volver a intentarlo.'};
  const {verifier,folderName}=JSON.parse(pending);
  const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client,client_secret:secret,code:body.code,code_verifier:verifier,grant_type:'authorization_code',redirect_uri:DRIVE_REDIRECT}),signal:AbortSignal.timeout(20000)});
  if(!response.ok){
    // Only classify documented error identifiers. Never expose upstream details,
    // which may contain codes, credentials or other private information.
    let reason;try{reason=(await response.json()).error;}catch{}
    const messages={
      invalid_client:'Google rechazó las credenciales del cliente de Drive. Comprueba que el ID y el secreto en Supabase pertenecen al mismo cliente Original Store Drive Multimedia.',
      invalid_grant:'Google rechazó la autorización por estar vencida, utilizada o no corresponder a este cliente. Inicia una conexión nueva de Drive.',
      unauthorized_client:'Este cliente de Google no permite esta autorización. Comprueba que sea un cliente de tipo Aplicación web.',
      redirect_uri_mismatch:'El retorno de Drive no coincide con el configurado en Google. Comprueba https://aloriginalstore.online/drive-callback.html.',
    };
    return {ok:false,error:messages[reason]||'Google no pudo autorizar la conexión. Vuelve a intentarlo.'};
  }
  const token=await response.json();
  if(!token.refresh_token||!token.access_token||!String(token.scope||'').split(' ').includes(SCOPE))return {ok:false,error:'Google no concedió el permiso necesario para guardar imágenes.'};
  // Reconnecting preserves the app-owned folder rather than creating duplicates.
  let previous;try{previous=readConnection(props,env);}catch{}
  let folder;
  if(previous?.folderId){
    const existing=await fetcher('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(previous.folderId)+'?fields=id,name,mimeType,trashed',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(20000)});
    if(existing.ok){const value=await existing.json();if(!value.trashed&&value.mimeType==='application/vnd.google-apps.folder')folder=value;}
  }
  if(!folder){
    const created=await fetcher('https://www.googleapis.com/drive/v3/files?fields=id,name',{method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:JSON.stringify({name:folderName,mimeType:'application/vnd.google-apps.folder'}),signal:AbortSignal.timeout(20000)});
    if(!created.ok)return {ok:false,error:'No se pudo preparar la carpeta de imágenes. Vuelve a conectar Drive.'};
    folder=await created.json();
  }
  if(!folder.id)return {ok:false,error:'No se pudo confirmar la carpeta de imágenes.'};
  props.setProperty(PROPERTY,sealConnection({refreshToken:token.refresh_token,folderId:folder.id,folderName:folder.name||folderName,clientId:client},env));
  await checkpoint([]);
  return {ok:true,connected:true,folderName:folder.name||folderName};
}
