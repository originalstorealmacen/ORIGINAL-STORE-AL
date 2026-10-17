/* Decorative login background only: never reads or writes authentication data. */
(()=>{
 const overlay=document.getElementById('mayorista-login-screen'),host=document.getElementById('wholesale-login-grid');
 if(!overlay||!host||document.body.classList.contains('wholesale-unlocked'))return;
 let dispose,idle,script,stopped=false;
 const active=()=>!stopped&&overlay.isConnected&&!document.body.classList.contains('wholesale-unlocked');
 const observer=new MutationObserver(()=>{if(!active())stop();});
 function stop(){if(stopped)return;stopped=true;if(idle)window.cancelIdleCallback?.(idle);observer.disconnect();dispose?.();script?.remove();}
 function image(value){if(typeof value!=='string'||!/^https?:\/\//i.test(value))return '';try{const u=new URL(value),width=innerWidth<=600?240:320;if(u.hostname==='drive.google.com'){const id=u.pathname.match(/\/file\/d\/([^/]+)/)?.[1]||u.searchParams.get('id');return id?'https://lh3.googleusercontent.com/d/'+encodeURIComponent(id)+'=w'+width:'';}if(u.hostname==='lh3.googleusercontent.com'&&u.pathname.startsWith('/d/'))return u.origin+u.pathname.replace(/=.*$/,'')+'=w'+width;return value;}catch{return '';}}
 function pictures(){let products=[];try{const c=JSON.parse(localStorage.getItem('original_store_products_drive_v4:'+window.ORIGINAL_STORE_API_URL)||'null');if(Array.isArray(c?.data?.products))products=c.data.products;}catch{}if(!products.length)products=window.ORIGINAL_STORE_CATALOG_BOOTSTRAP?.rows||[];const seen=new Set(),out=[];for(const p of products){if(/inactivo|eliminado|banner/i.test(String(p.Estado||p.Categoria||'')))continue;const src=image(p['Imagen Principal']||p.Imagen||p.imagen||p.Foto||'');if(!src||seen.has(src))continue;seen.add(src);out.push(src);if(out.length>=(innerWidth<=600?6:10))break;}return out;}
 function start(){if(!active())return;script=document.createElement('script');script.src='wholesale-login-grid.js?v=20261017';script.async=true;script.onload=()=>{if(active()&&window.OriginalStoreWholesaleGrid)dispose=window.OriginalStoreWholesaleGrid.mount(host,pictures());};script.onerror=()=>{host.dataset.motion='unavailable';};document.head.append(script);}
 observer.observe(document.body,{attributes:true,attributeFilter:['class'],childList:true});
 if('requestIdleCallback' in window)idle=requestIdleCallback(start,{timeout:1200});else setTimeout(start,200);
 window.addEventListener('pagehide',stop,{once:true});
})();
