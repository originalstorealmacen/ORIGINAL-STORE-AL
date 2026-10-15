(()=>{
 if(window.ORIGINAL_STORE_BACKEND?.provider!=='supabase')return;
 let card,field,message,pill,connect,check,busy=false,connected=false,folderEdited=false;
 const hasSession=()=>typeof secureAdminCredential!=='undefined'&&!!secureAdminCredential;
 const paint=(text,state='')=>{message.textContent=text;message.dataset.state=state;};
 const badge=(text,state='')=>{pill.textContent=text;pill.dataset.state=state;};
 const request=async body=>{
  const response=await fetch(window.ORIGINAL_STORE_API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('No se pudo comunicar con Drive. Vuelve a intentarlo.');
  const result=await response.json();if(!result.ok)throw new Error(result.error||'No se pudo comprobar Drive.');return result;
 };
 const locked=value=>{busy=value;connect.disabled=value;check.disabled=value;};
 async function refresh(){
  if(busy)return;
  if(!hasSession()){badge('Inicia sesión');paint('Inicia sesión en el administrador para consultar tu conexión.');return;}
  locked(true);badge('Comprobando');paint('Comprobando la conexión guardada…');
  try{
   const result=await request({action:'drivestatus'});connected=!!result.connected;
   connect.textContent=connected?'Reconectar Drive':'Conectar Drive';field.readOnly=connected;
   if(connected){if(!folderEdited||result.folderName)field.value=result.folderName||'Original Store Imágenes';badge('Conectado','connected');paint('Conexión guardada · '+field.value+'. Las nuevas imágenes se guardarán en esta carpeta.');}
   else{badge(result.configured?'Sin conectar':'Pendiente');paint(result.configured?'Conecta tu cuenta de Google para guardar las nuevas imágenes.':'Primero configura el cliente de Drive en los secretos de Supabase.');}
  }catch(error){badge('Revisar conexión','error');paint(error.message,'error');}finally{locked(false);}
 }
 async function begin(){
  if(busy)return;if(!hasSession()){paint('Primero inicia sesión en el administrador.','error');return;}
  const folderName=field.value.trim();if(!folderName){paint('Escribe un nombre para la carpeta de imágenes.','error');field.focus();return;}
  locked(true);paint('Preparando la autorización de Google…');
  try{
   const result=await request({action:'drivebegin',folderName});const url=new URL(result.url);
   if(url.origin!=='https://accounts.google.com'||url.searchParams.get('state')!==result.state||!/^[-\w]{43}$/.test(result.state))throw new Error('Respuesta de autorización inválida.');
   sessionStorage.setItem('original-store-drive-endpoint',window.ORIGINAL_STORE_BACKEND.supabase);sessionStorage.setItem('original-store-drive-state',result.state);location.assign(url.href);
  }catch(error){paint(error.message,'error');locked(false);}
 }
 function openDrive(){
  if(typeof switchDashboardView==='function')switchDashboardView('settings','Configuración del Sitio');
  card.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});refresh();
 }
 const mount=()=>{
  const panel=document.querySelector('#view-settings > .admin-panel');if(!panel||document.getElementById('original-store-drive-card'))return;
  const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href='drive-ui.css?v=original-store-drive-ui-20261013';document.head.append(stylesheet);
  card=document.createElement('section');card.id='original-store-drive-card';card.className='os-drive-card';card.setAttribute('aria-labelledby','original-store-drive-heading');
  card.innerHTML='<div class="os-drive-header"><div class="os-drive-heading"><span class="os-drive-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="#16a765" d="M8.2 2 1 14.5l4.1 7L12.3 9z"/><path fill="#f9c84c" d="M8.2 2h8L23 14.5h-8z"/><path fill="#4887ed" d="m5.1 21.5 4-7H23l-4 7z"/></svg></span><div><span class="drive-eyebrow">Almacenamiento multimedia</span><h3 id="original-store-drive-heading">Google Drive</h3></div></div><span class="drive-pill" id="original-store-drive-pill">Sin comprobar</span></div><p class="os-drive-description">Conecta la cuenta donde guardarás tus nuevas imágenes. Tus imágenes actuales conservan sus enlaces.</p><div class="os-drive-controls"><div class="os-drive-field"><label for="original-store-drive-folder">Nombre de la carpeta</label><input class="drive-folder-input" id="original-store-drive-folder" value="Original Store Imágenes" maxlength="100" autocomplete="off"></div><button type="button" class="drive-button" id="original-store-drive-connect">Conectar Drive</button><button type="button" class="drive-button drive-button-secondary" id="original-store-drive-check">Comprobar conexión</button></div><p class="os-drive-message" id="original-store-drive-message" role="status" aria-live="polite">Comprueba el estado o conecta tu cuenta de Google.</p>';
  const tabs=panel.querySelector('.settings-tabs');panel.insertBefore(card,tabs||null);
  field=card.querySelector('input');message=card.querySelector('.os-drive-message');pill=card.querySelector('.drive-pill');connect=card.querySelector('#original-store-drive-connect');check=card.querySelector('#original-store-drive-check');
  field.addEventListener('input',()=>{folderEdited=true;});connect.addEventListener('click',begin);check.addEventListener('click',refresh);
  const sidebar=document.querySelector('.sub-sidebar .sidebar-menu-wrapper')||document.querySelector('.sub-sidebar');
  if(sidebar){const shortcut=document.createElement('button');shortcut.type='button';shortcut.className='sidebar-btn';shortcut.setAttribute('aria-label','Google Drive');shortcut.innerHTML='<span>GD</span><span class="sidebar-label">Google Drive</span>';shortcut.addEventListener('click',openDrive);sidebar.append(shortcut);}
  document.addEventListener('click',event=>{if(event.target.closest('[data-view="settings"]'))setTimeout(refresh,0);});
  if(location.hash==='#drive'){openDrive();if(!hasSession())paint('Inicia sesión y pulsa «Comprobar conexión» para ver el estado de Drive.');}
  else if(hasSession())refresh();
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
