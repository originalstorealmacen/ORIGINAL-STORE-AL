(async()=>{
 const status=document.getElementById('drive-status'),params=new URLSearchParams(location.search);
 const card=document.getElementById('drive-result'),heading=document.getElementById('drive-heading'),badge=document.getElementById('drive-result-badge'),icon=document.getElementById('drive-result-icon');
 const state=params.get('state'),pending=sessionStorage.getItem('original-store-drive-state'),endpoint=sessionStorage.getItem('original-store-drive-endpoint');
 history.replaceState(null,'',location.pathname);
 const back=document.getElementById('drive-return');if(back&&window.ORIGINAL_STORE_BACKEND.provider!=='supabase')back.href='administrativo-supabase-preview.html#drive';else if(back)back.href='administrativo.html#drive';
 sessionStorage.removeItem('original-store-drive-state');sessionStorage.removeItem('original-store-drive-endpoint');
 const outcome=(success,message)=>{
  card.dataset.state=success?'success':'error';heading.textContent=success?'Drive conectado':'No pudimos conectar Drive';badge.textContent=success?'Conectado':'Revisar conexión';status.textContent=message;
  icon.innerHTML=success?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 7v6m0 4h.01"/><circle cx="12" cy="12" r="9"/></svg>';
  document.title=(success?'Drive conectado':'Revisar conexión de Drive')+' — Original Store';
 };
 try{
  if(!state||state!==pending||endpoint!==window.ORIGINAL_STORE_BACKEND.supabase)throw new Error('Esta autorización no corresponde a una conexión iniciada aquí. Vuelve al administrador y conecta Drive otra vez.');
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'drivefinish',state,code:params.get('code'),error:params.get('error')}),cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('No se pudo comunicar con el servidor. Inicia una conexión nueva.');
  const result=await response.json();if(!result.ok)throw new Error(result.error||'No se pudo conectar Drive.');
  outcome(true,'Las nuevas imágenes se guardarán en tu carpeta de Original Store. Puedes volver al administrador para continuar.');
  document.getElementById('drive-folder-name').textContent=result.folderName||'Original Store Imágenes';document.getElementById('drive-folder').hidden=false;
 }catch(error){outcome(false,error.message||'No se pudo completar la conexión.');}
})();
