// Run ONLY from the private Apps Script editor of Original Store, as its owner.
// This copies server authentication settings once. It does not import Sheets or catalogue data.
function transferirEstadoServidorOriginalStore(){
 const owner=String(Session.getEffectiveUser().getEmail()||'').toLowerCase();
 if(owner!=='originalstorealmacen@gmail.com')throw new Error('Ejecuta desde la cuenta propietaria de Original Store.');
 const props=PropertiesService.getScriptProperties(),base='https://zhtrwvbmkxxfxvdhgngs.supabase.co';
 if(props.getProperty('ORIGINAL_STORE_SUPABASE_URL')!==base)throw new Error('El proyecto configurado no es Original Store.');
 const key=props.getProperty('ORIGINAL_STORE_SUPABASE_SECRET');if(!key)throw new Error('Falta la conexión privada del servidor actual.');
 function rpc(name,payload){const headers={apikey:key};if(key.indexOf('sb_secret_')!==0)headers.Authorization='Bearer '+key;const response=UrlFetchApp.fetch(base+'/rest/v1/rpc/'+name,{method:'post',contentType:'application/json',headers:headers,payload:JSON.stringify(payload||{}),muteHttpExceptions:true});if(response.getResponseCode()!==200)throw new Error('No se pudo transferir el estado. No repitas la operación sin comprobarla.');return JSON.parse(response.getContentText());}
 const state=rpc('store_read_server_state',{});if(!state||!state.properties)throw new Error('Primero prepara el nuevo servidor.');
 if(state.properties.ORIGINAL_STORE_STATE_TRANSFERRED_AT)throw new Error('La transferencia ya fue realizada. No se sobrescribió ningún dato.');
 const transferred=Object.assign({},state.properties),source=props.getProperties();
 Object.keys(source).forEach(function(name){if(/^BLYXU_ADMIN_/.test(name)||/^customer-key-(?:owner-)?/.test(name))transferred[name]=source[name];});
 transferred.BLYXU_ADMIN_EMAILS='originalstorealmacen@gmail.com';
 transferred.ORIGINAL_STORE_STATE_TRANSFERRED_AT=new Date().toISOString();
 rpc('store_commit_server',{expected_revision:state.revision,changes:[],server_properties:transferred,server_cache:state.cache||{}});
 console.log('Estado administrativo de Original Store transferido. No se copiaron claves de Supabase, Drive ni Mercado Pago.');
}
