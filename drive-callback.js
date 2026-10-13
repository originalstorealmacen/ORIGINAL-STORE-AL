(async()=>{
 const status=document.getElementById('drive-status'),params=new URLSearchParams(location.search);
 const state=params.get('state'),pending=sessionStorage.getItem('original-store-drive-state'),endpoint=sessionStorage.getItem('original-store-drive-endpoint');
 history.replaceState(null,'',location.pathname);
 const back=document.getElementById('drive-return');if(back&&window.ORIGINAL_STORE_BACKEND.provider!=='supabase')back.href='administrativo-supabase-preview.html';
 sessionStorage.removeItem('original-store-drive-state');sessionStorage.removeItem('original-store-drive-endpoint');
 try{
  if(!state||state!==pending||endpoint!==window.ORIGINAL_STORE_BACKEND.supabase)throw new Error('Esta autorización no corresponde a una conexión iniciada aquí. Vuelve al administrador y conecta Drive otra vez.');
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'drivefinish',state,code:params.get('code'),error:params.get('error')}),cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('No se pudo comunicar con el servidor. Inicia una conexión nueva.');
  const result=await response.json();if(!result.ok)throw new Error(result.error||'No se pudo conectar Drive.');
  status.textContent='Drive conectado. Las imágenes nuevas se guardarán en «'+result.folderName+'». Puedes volver al administrador.';
 }catch(error){status.textContent=error.message||'No se pudo completar la conexión.';}
})();
