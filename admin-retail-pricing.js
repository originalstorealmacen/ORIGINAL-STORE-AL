import {retailMode,retailPrice,percentage,RETAIL_MODE_KEY,RETAIL_PERCENT_KEY} from './retail-pricing-core.js';
let percent=0,loaded=false,loading;
const $=id=>document.getElementById(id);
const money=value=>typeof parseAmount==='function'?parseAmount(value):Number(value)||0;
const records=()=>typeof inventario!=='undefined'?inventario:[];
const id=p=>String(p?.idVariacion||p?.['ID Variación']||p?.['ID Variacion']||p?.ID||'');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options=mode=>`<option value="porcentaje" ${mode==='porcentaje'?'selected':''}>Aplicar porcentaje general</option><option value="manual" ${mode==='manual'?'selected':''}>Precio manual</option>`;
function rows(){return [...document.querySelectorAll('#variants-container .admin-panel,#variants-container .variant-edit-card')].filter(root=>root.querySelector('.var-precio,.ve-precio'));}
function rowId(root){return root.querySelector('.var-id,.ve-id')?.value||root.dataset.varid||'';}
function syncField(root,price,wholesale,select){
 if(!price||!select)return;
 const auto=select.value==='porcentaje';price.readOnly=auto;price.setAttribute('aria-readonly',String(auto));
 if(auto){const next=loaded?String(retailPrice(money(wholesale?.value||$('prod-precio-mayorista')?.value),percent)):'';if(price.value!==next){price.value=next;price.dispatchEvent(new Event('input',{bubbles:true}));}}
 if(root===document){const hint=$('prod-retail-hint');if(hint)hint.textContent=auto?(loaded?`Mayorista + ${percent} %. Se redondea al peso más cercano.`:'Cargando porcentaje general…'):'Precio personalizado. No cambia con el porcentaje general.';}
}
function sync(){
 syncField(document,$('prod-precio'),$('prod-precio-mayorista'),$('prod-retail-mode'));
 for(const root of rows()){
  const price=root.querySelector('.var-precio,.ve-precio'),wholesale=root.querySelector('.var-precio-mayor,.ve-precio-mayorista');
  let select=root.querySelector('.var-retail-mode,.ve-retail-mode');
  if(!select){
   select=document.createElement('select');select.className='form-control '+(price.classList.contains('ve-precio')?'ve-retail-mode':'var-retail-mode');select.setAttribute('aria-label','Modo de precio minorista de variante');
   const record=records().find(p=>id(p)===rowId(root));
   select.innerHTML=options(record?retailMode(record):$('prod-retail-mode')?.value||'porcentaje');price.before(select);
  }
  syncField(root,price,wholesale,select);
 }
}
async function load(){
 if(loading)return loading;
 loading=(async()=>{
  const config=await loadSiteConfigForAdmin({force:true,throwOnError:true});
  percent=percentage(config[RETAIL_PERCENT_KEY]??'0');loaded=true;
  if($('retail-global-percent'))$('retail-global-percent').value=String(percent);
  sync();
 })().catch(error=>{if($('retail-global-status'))$('retail-global-status').textContent='No se pudo cargar el porcentaje. Vuelve a abrir Inventario para reintentar.';throw error;}).finally(()=>{loading=null;});
 return loading;
}
async function post(body){
 const res=await fetch(GOOGLE_SHEET_API,{method:'POST',body:JSON.stringify(body)}),result=await res.json();
 if(!res.ok||(!result.ok&&result.status!=='success'))throw Error(result.error||'No se pudo guardar el precio.');return result;
}
function decorate(payload){
 const key=id(payload);let select;
 const row=rows().find(root=>rowId(root)===key);
 if(row)select=row.querySelector('.var-retail-mode,.ve-retail-mode');
 else if(key=== $('prod-id')?.value)select=$('prod-retail-mode');
 if(select)payload[RETAIL_MODE_KEY]=select.value;
 // Partial category/stock edits must preserve the original mode.
 if(payload[RETAIL_MODE_KEY]==='porcentaje'){
  if(!loaded)throw Error('Espera a que cargue el porcentaje general antes de guardar.');
  payload.Precio=retailPrice(money(payload['Precio Mayor']??payload.Precio_Mayorista),percent);
 }
 return payload;
}
function inventoryControl(p){
 const mode=retailMode(p),key=escape(id(p));
 return `<details class="retail-product-choice" data-retail-product="${key}"><summary>Precio minorista · ${mode==='porcentaje'?'Porcentaje':'Manual'}</summary><label>Cómo calcular el precio<select class="form-control retail-product-mode">${options(mode)}</select></label><label>Precio personalizado<input class="form-control retail-product-price" inputmode="decimal" value="${escape(p.Precio||'')}" ${mode==='porcentaje'?'disabled':''}></label><small>Porcentaje general: ${percent} % sobre el mayorista. Solo cambia esta referencia.</small><button type="button" class="admin-btn retail-product-save">Guardar precio</button><span role="status" class="retail-product-status"></span></details>`;
}
function init(){
 $('prod-retail-mode')?.addEventListener('change',sync);
 document.addEventListener('input',event=>{if(event.target.matches('#prod-precio-mayorista,.var-precio-mayor,.ve-precio-mayorista'))sync();});
 document.addEventListener('change',event=>{
  if(event.target.matches('.var-retail-mode,.ve-retail-mode'))sync();
  if(event.target.matches('.retail-product-mode'))event.target.closest('details').querySelector('.retail-product-price').disabled=event.target.value==='porcentaje';
 });
 $('view-inventory')?.addEventListener('click',async event=>{
  const button=event.target.closest('.retail-product-save');if(!button)return;
  const detail=button.closest('[data-retail-product]'),status=detail.querySelector('.retail-product-status'),mode=detail.querySelector('select').value,priceInput=detail.querySelector('input');
  button.disabled=true;status.textContent='Guardando…';
  try{
   const product=records().find(p=>id(p)===detail.dataset.retailProduct);if(!product)throw Error('Actualiza el inventario y vuelve a intentar.');
   const price=money(priceInput.value);if(mode==='manual'&&(!Number.isFinite(price)||price<=0))throw Error('Escribe un precio manual mayor que cero.');
   await post({resource:'productos',action:'editar',id:id(product),data:{[RETAIL_MODE_KEY]:mode,...(mode==='manual'?{Precio:price}:{})}});
   clearPublicProductsCache();await cargarInventario({force:true,silent:true,throwOnError:true});showToast('Precio minorista actualizado','success');
  }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
 });
 $('retail-save-percent')?.addEventListener('click',async()=>{
  const button=$('retail-save-percent'),status=$('retail-global-status');button.disabled=true;
  try{
   const value=percentage($('retail-global-percent').value);
   await post({action:'setconfig',Clave:RETAIL_PERCENT_KEY,Valor:String(value)});
   percent=value;loaded=true;updateSiteConfigCacheForAdmin(RETAIL_PERCENT_KEY,value);sync();
   await cargarInventario({force:true,silent:true});
   renderQuickSaleResults();renderQuickSaleCart();
   status.textContent=`${percent} % aplicado. Los productos con precio manual se conservan.`;
  }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
 });
 // Initialize controls only for added variant nodes; avoid observing text/price updates.
 const container=$('variants-container');if(container)new MutationObserver(()=>sync()).observe(container,{childList:true,subtree:true});

 load().then(()=>{if(records().length)renderInventoryInBatches();}).catch(()=>{});sync();
}
window.OriginalStoreRetailPricing={sync,decorate,inventoryControl,load,edit(product){$('prod-retail-mode').value=retailMode(product);sync();},reset(){if($('prod-retail-mode'))$('prod-retail-mode').value='porcentaje';sync();}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
