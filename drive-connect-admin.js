(()=>{
 if(window.ORIGINAL_STORE_BACKEND?.provider!=='supabase')return;
 const button=document.createElement('button');button.type='button';button.textContent='Conectar Drive';button.className='sidebar-btn';
 const message=document.createElement('p');message.setAttribute('role','status');message.style.cssText='font-size:12px;padding:8px;overflow-wrap:anywhere';
 const mount=()=>{const sidebar=document.querySelector('.sub-sidebar .sidebar-menu-wrapper')||document.querySelector('.sub-sidebar')||document.querySelector('.sidebar');if(!sidebar)return;sidebar.append(button,message);};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
 button.addEventListener('click',async()=>{
  if(typeof secureAdminCredential==='undefined'||!secureAdminCredential){message.textContent='Primero inicia sesión en el administrador.';return;}
  button.disabled=true;message.textContent='Preparando la conexión…';
  try{
   const response=await fetch(window.ORIGINAL_STORE_API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'drivebegin',folderName:'Original Store Imágenes'}),cache:'no-store',signal:AbortSignal.timeout(25000)});
   if(!response.ok)throw new Error('No se pudo preparar la conexión.');const result=await response.json();if(!result.ok)throw new Error(result.error||'No se pudo preparar la conexión.');
   const url=new URL(result.url);if(url.origin!=='https://accounts.google.com'||url.searchParams.get('state')!==result.state)throw new Error('Respuesta de autorización inválida.');
   sessionStorage.setItem('original-store-drive-endpoint',window.ORIGINAL_STORE_BACKEND.supabase);sessionStorage.setItem('original-store-drive-state',result.state);location.assign(url.href);
  }catch(error){message.textContent=error.message;button.disabled=false;}
 });
})();
