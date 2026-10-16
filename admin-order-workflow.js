/* Administrative quote review: existing auth wrapper and order list are reused. */
(()=>{
 let current=null,dirty=false;
 const kind=p=>OriginalStoreOrderFlow.kindOf(p);
 const $=id=>document.getElementById(id);
 const esc=value=>escapeHtml(String(value??''));
 const items=p=>{try{return Array.isArray(p['Productos JSON'])?p['Productos JSON']:JSON.parse(p['Productos JSON']||'[]');}catch{return [];}};
 function filter(p){const selected=$('admin-order-kind-filter')?.value||'all';return selected==='all'||kind(p)===selected;}
 function status(message){$('quote-review-status').textContent=message;}
 function total(){let sum=0,missing=false;document.querySelectorAll('#quote-review-items tr').forEach(row=>{const raw=row.querySelector('.quote-price').value,price=Number(raw),qty=Number(row.querySelector('.quote-qty').value);if(!raw.trim()||price<=0)missing=true;else sum+=price*qty;});$('quote-review-total').textContent=(sum>0?'Estimado: $'+sum.toLocaleString('es-CO'):'Por cotizar')+(missing&&sum>0?' · faltan precios':'');}
 function updateConvert(){const button=$('quote-convert');if(button)button.disabled=dirty||!$('quote-client-accepted').checked||current?.['Estado Cotizacion']!=='Revisada';}
 function open(index){const p=window.pedidosList?.[index];if(!p||kind(p)!=='quote')return;current=structuredClone(p);dirty=false;
  const modal=$('quote-review-modal');$('quote-review-reference').textContent=p['ID Pedido'];$('quote-client-accepted').checked=false;
  $('quote-review-items').innerHTML=items(p).map(item=>`<tr data-reference="${esc(item.idVariacion||item.id||item.sku)}"><td>${esc(item.nombre||item.Nombre||'Producto')}<small>${esc(item.idVariacion||item.id||item.sku)}</small></td><td><input class="form-control quote-qty" aria-label="Cantidad" type="number" min="1" max="1000" step="1" value="${esc(item.cantidad||1)}"></td><td><input class="form-control quote-price" aria-label="Precio unitario estimado" inputmode="decimal" type="number" min="0.01" max="1000000000" step="0.01" placeholder="Por cotizar" value="${Number(item.precio)>0?esc(item.precio):''}"></td></tr>`).join('');
  status('Edita cantidades y precios. Guarda la revisión antes de confirmar la aceptación.');total();updateConvert();modal.showModal();
 }
 async function submit(convert){if(!current)return;const save=$('quote-save'),button=$('quote-convert');save.disabled=button.disabled=true;status('Comprobando precios y existencias…');
  try{
   const rows=[...document.querySelectorAll('#quote-review-items tr')];
   const lines=rows.map(row=>({idVariacion:row.dataset.reference,cantidad:Number(row.querySelector('.quote-qty').value),precio:row.querySelector('.quote-price').value.trim()||null}));
   const payload={action:convert?'convertquote':'reviewquote',orderId:current['ID Pedido'],expectedVersion:Number(current['Version Pedido']||1),...(convert?{accepted:$('quote-client-accepted').checked}:{items:lines})};
   const response=await fetch(GOOGLE_SHEET_API,{method:'POST',body:JSON.stringify(payload)}),result=await response.json();if(!result.ok)throw Error(result.error||'No se pudo guardar.');
   current=result.data;const index=window.pedidosList.findIndex(p=>p['ID Pedido']===current['ID Pedido']);if(index>=0)window.pedidosList[index]=current;
   dirty=false;$('quote-client-accepted').checked=false;writeAdminOrdersCache();renderPedidos();
   if(convert){$('quote-review-modal').close();showToast('Cotización convertida en pedido con la misma referencia. Sin factura ni cobro.','success');}
   else status('Cotización guardada. Confirma la aceptación del cliente para convertirla en pedido.');
  }catch(error){status(error.message+' Tus cambios siguen en este recuadro.');}
  finally{save.disabled=false;updateConvert();}
 }
 function init(){
  $('admin-order-kind-filter')?.addEventListener('change',()=>renderPedidos());
  $('quote-review-items')?.addEventListener('input',()=>{dirty=true;$('quote-client-accepted').checked=false;total();updateConvert();});
  $('quote-client-accepted')?.addEventListener('change',updateConvert);
  $('quote-save')?.addEventListener('click',()=>submit(false));$('quote-convert')?.addEventListener('click',()=>submit(true));
  $('quote-review-close')?.addEventListener('click',()=>$('quote-review-modal').close());
 }
 window.OriginalStoreOrderAdmin={kind,filter,review:open};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
