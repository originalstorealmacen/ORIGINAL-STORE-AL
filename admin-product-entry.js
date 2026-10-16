/* Progressive controls for new products only. Existing edit/inventory flows stay intact. */
(()=>{
 const $=id=>document.getElementById(id);let installed=false;
 const isNew=()=>typeof isEditingProduct!=='undefined'&&!isEditingProduct;
 function group(root,kind,nodes,active){
  if(!nodes.length)return;
  const wrap=document.createElement('div');wrap.className='entry-option entry-option-'+kind;
  const label=document.createElement('label');label.className='entry-option-toggle';
  const toggle=document.createElement('input');toggle.type='checkbox';toggle.role='switch';toggle.className=root===document?'prod-enable-'+kind:'var-enable-'+kind;
  if(root===document)toggle.id='prod-enable-'+kind;
  toggle.checked=active;toggle.defaultChecked=active;
  label.append(toggle,document.createTextNode({color:'Color',style:'Estilo',size:'Tamaño / medidas',gallery:'Fotos de ángulos'}[kind]));
  const panel=document.createElement('div');panel.className='entry-option-panel';
  nodes[0].before(wrap);wrap.append(label,panel);nodes.forEach(n=>panel.append(n));
  wrap.dataset.kind=kind;toggle.addEventListener('change',()=>{
   if(kind==='gallery'&&$('prod-galeria')?.dataset.uploadState==='uploading'&&!toggle.checked){toggle.checked=true;showToast('Espera a que termine la carga de ángulos.');return;}
   apply(wrap,isNew());if(kind==='size'){if(root===document)updateProductMeasurementFields();else syncVariantSizeField(root);}initColorPickers(wrap);scheduleLivePreview();
  });
  return wrap;
 }
 function apply(wrap,simple,restore=false){
  const toggle=wrap.querySelector('.entry-option-toggle input'),panel=wrap.querySelector('.entry-option-panel');
  wrap.querySelector('.entry-option-toggle').hidden=!simple;
  const on=!simple||toggle.checked;panel.hidden=!on;
  for(const input of panel.querySelectorAll('input,select,textarea')){
   if(input.type==='file'||input.type==='checkbox')continue;
   if(on){if(input.dataset.entryHiddenValue!==undefined){if(simple)input.value=input.dataset.entryHiddenValue;delete input.dataset.entryHiddenValue;}input.disabled=false;}
   else{if(wrap.dataset.entryOff!=='1'&&input.value)input.dataset.entryHiddenValue=input.value;input.value='';input.disabled=true;}
  }
  wrap.dataset.entryOff=on?'0':'1';
  const row=wrap.closest('#variants-container .admin-panel');
  if(row&&wrap.dataset.kind==='size'){
   const mode=row.querySelector('.var-size-mode');if(mode)mode.value=simple?(on?'custom':'auto'):(mode.value||'auto');
   if(simple&&!on)syncVariantSizeField(row);
  }
 }
 function addStyleChoice(node,main){
  const label=document.createElement('label');label.className='entry-style-image-choice';
  const input=document.createElement('input');input.type='checkbox';input.className=main?'prod-style-show-image':'var-style-show-image';if(main)input.id='prod-style-show-image';
  label.append(input,document.createTextNode('Mostrar imagen en el botón de estilo'));node.append(label);
 }
 function main(){
  if(installed)return;installed=true;
  const form=$('product-form');if(!form)return;
  const closest=id=>$(id)?.closest('.form-group');
  group(document,'color',[closest('prod-color')].filter(Boolean),!!$('prod-color')?.value);
  const style=group(document,'style',[closest('prod-estilo')].filter(Boolean),!!$('prod-estilo')?.value);if(style)addStyleChoice(style.querySelector('.entry-option-panel'),true);
  group(document,'size',[closest('prod-tamano'),closest('prod-size-kind'),$('prod-textile-size-fields'),$('prod-physical-size-fields')].filter(Boolean),!!($('prod-tamano')?.value||$('prod-size-kind')?.value));
  const gallery=document.querySelector('.angle-gallery-manager');if(gallery)group(document,'gallery',[gallery],!!$('prod-galeria')?.value);
 }
 function card(root){
  if(!root||root.dataset.entryControls)return;root.dataset.entryControls='1';
  const closest=sel=>root.querySelector(sel)?.closest('.form-group');
  group(root,'color',[closest('.var-color')].filter(Boolean),false);
  const style=group(root,'style',[closest('.var-estilo')].filter(Boolean),false);if(style)addStyleChoice(style.querySelector('.entry-option-panel'),false);
  group(root,'size',[closest('.var-tamano')].filter(Boolean),false);
  sync();
 }
 function sync(){
  const form=$('product-form');if(!form)return;
  const simple=isNew();form.dataset.simpleEntry=String(simple?1:0);
  form.querySelectorAll('.entry-option').forEach(w=>apply(w,simple));
  form.querySelectorAll('.entry-style-image-choice').forEach(n=>n.hidden=!simple);
  const price=$('prod-precio');if(price){price.required=!simple;price.placeholder=simple?'Opcional · 0 por cotizar':'Ej: 25000';}
  const preview=$('admin-detail-preview');if(preview)preview.dataset.entryPreview=simple?'1':'0';
  const mainId=$('prod-id');if(mainId)mainId.readOnly=simple;
  form.querySelectorAll('.var-id').forEach(el=>el.readOnly=simple);
  const title=$('product-main-step-title');if(title)title.textContent=simple?'Variable inicial V01':'Producto principal';
  const heading=$('product-main-heading');if(heading)heading.textContent=simple?'Variable inicial V01':'Producto principal y stock';
  for(const id of ['btn-add-manual-variant','btn-add-variant']){const b=$(id);if(b)b.textContent=simple?'Añadir variante':(id==='btn-add-variant'?'Añadir variantes':'Agregar variante manual');}
 }
 function decorate(payload,root){
  if(!isNew())return payload;
  const control=root?.querySelector('.var-style-show-image')||$('prod-style-show-image');
  payload['Vista Variante']=control?.checked?'imagen':'texto';
  if(!$('prod-enable-gallery')?.checked){payload['Galería JSON']='[]';payload['Galeria JSON']='[]';}
  return payload;
 }
 function init(){main();sync();}
 window.OriginalStoreProductEntry={isNew,card,sync,decorate,init,reset(){for(const input of document.querySelectorAll('#product-form [data-entry-hidden-value]'))delete input.dataset.entryHiddenValue;document.querySelectorAll('#product-form .entry-option').forEach(w=>delete w.dataset.entryOff);}};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
