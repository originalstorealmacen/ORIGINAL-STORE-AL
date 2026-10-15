/* Identity changes are local draft operations; this module never saves products. */
(() => {
  'use strict';
  let api, busy=false, initialized=false;
  const $=id=>document.getElementById(id), value=id=>$(id)?.value?.trim()||'';
  const normal=v=>api.normalize(v), generated=(mother,id)=>normal(api.barcode(mother,id));
  const key=v=>String(v||'').trim().toUpperCase();
  const rootFor=input=>input?.closest('.var-edit-expanded, .admin-panel, .variant-edit-card');
  function rows(){
    return [...document.querySelectorAll('#variants-container .var-id, #variants-container .ve-id')].map(id=>{
      const root=rootFor(id),barcode=root?.querySelector('.var-barcode,.ve-barcode');
      return {id,root,barcode,original:root?.dataset.originalVarid||root?.closest('[data-varid]')?.dataset.varid||''};
    });
  }
  function main(){return {id:$('prod-id'),barcode:$('prod-barcode'),root:$('product-form'),original:$('product-form')?.dataset.originalVariationId||''};}
  function external(){
    const originals=new Set([main().original,...rows().map(r=>r.original)].filter(Boolean).map(key));
    return (api.inventory?.()||[]).filter(p=>!originals.has(key(api.inventoryId(p))));
  }
  function validate(entries){
    const assigned=new Map(),outside=external(),blocked=new Set(outside.flatMap(p=>[key(api.inventoryId(p)),key(api.inventoryBarcode(p))]).filter(Boolean));
    entries.forEach((row,index)=>{
      const id=key(row.id),code=key(row.code);
      if(!id)throw Error('Cada producto y variante debe tener una referencia.');
      for(const reference of new Set([id,code].filter(Boolean))){
        if(blocked.has(reference)||(assigned.has(reference)&&assigned.get(reference)!==index))throw Error('La referencia o código '+reference+' ya identifica otro producto o variante.');
        assigned.set(reference,index);
      }
    });
  }

  function notify(){
    api.preview?.();document.dispatchEvent(new CustomEvent('original-store:identity-updated'));
  }
  function refreshCode(row,mother,oldId){
    if(!row.barcode)return;
    const prior=normal(row.barcode.dataset.generatedBarcode||api.barcode(row.barcode.dataset.identityMother||mother,oldId));
    const own=row.barcode.dataset.autoBarcode==='0'||(row.barcode.value&&normal(row.barcode.value)!==prior);
    const auto=generated(mother,row.id.value);row.barcode.dataset.generatedBarcode=auto;row.barcode.dataset.identityMother=mother;
    if(!own){row.barcode.value=auto;row.barcode.dataset.autoBarcode='1';}
    else row.barcode.dataset.autoBarcode='0';
    row.barcode.setCustomValidity('');
    const qr=row.root?.querySelector('[data-variant-qr]');if(qr)qr.src=api.qr(row.barcode.value||auto);
  }
  function rebase(raw,{physical=false}={}){
    if(busy)return;const mother=normal(raw);if(!mother)return;
    if(generated(mother,mother+'-V01')===generated(mother,mother+'-V02'))throw Error('Acorta el ID madre para que cada referencia y QR sean únicos.');
    const oldMother=$('product-form')?.dataset.identityMother||value('prod-id-producto'),all=rows(),base=main();
    const fixed=r=>r.id.dataset.scannedReference==='1'||r.id.dataset.identityAuto==='0'||(r.id.value&&!new RegExp('^'+oldMother.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'-V\\d+$','i').test(r.id.value));
    const assigned=new Set(all.filter(fixed).flatMap(r=>[key(r.id.value),key(r.barcode?.value)]).filter(Boolean));
    for(const row of all)if(row.barcode?.dataset.autoBarcode==='0')assigned.add(key(row.barcode.value));
    for(const product of external()){assigned.add(key(api.inventoryId(product)));assigned.add(key(api.inventoryBarcode(product)));}
    const primary=mother+'-V01';if(assigned.has(key(primary)))throw Error('La referencia '+primary+' ya identifica otro producto o variante.');
    assigned.add(key(primary));let number=2;
    const plan=[{row:base,id:primary,code:physical?mother:(base.barcode?.dataset.autoBarcode==='0'?normal(base.barcode.value):generated(mother,primary)),auto:true}];
    for(const row of all){
      const auto=!fixed(row);let id=row.id.value.trim();
      if(auto){do{id=mother+'-V'+String(number++).padStart(2,'0');}while(assigned.has(key(id))||assigned.has(key(generated(mother,id))));assigned.add(key(id));}
      const oldGenerated=normal(row.barcode?.dataset.generatedBarcode||api.barcode(oldMother,row.id.value));
      const own=row.barcode&&(row.barcode.dataset.autoBarcode==='0'||(row.barcode.value&&normal(row.barcode.value)!==oldGenerated));
      plan.push({row,id,code:own?normal(row.barcode.value):generated(mother,id),auto});
    }
    validate(plan);busy=true;
    try{
      $('prod-id-producto').value=mother;if($('prod-id-producto-hidden'))$('prod-id-producto-hidden').value=mother;
      $('product-form').dataset.identityMother=mother;
      for(const entry of plan){
        const {row,id,code,auto}=entry,oldId=row.id.value;row.id.value=id;row.id.dataset.identityAuto=auto?'1':'0';
        if(row===base)row.id.dataset.scannedReference='0';
        const sku=row===base?$('prod-sku'):row.root?.querySelector('.ve-sku');if(sku&&key(sku.value)===key(oldId))sku.value=id;
        if(row.barcode){row.barcode.value=code;row.barcode.dataset.generatedBarcode=generated(mother,id);row.barcode.dataset.identityMother=mother;
          row.barcode.dataset.autoBarcode=key(code)===key(generated(mother,id))?'1':'0';row.barcode.setCustomValidity('');}
        const qr=row.root?.querySelector('[data-variant-qr]');if(qr&&row.barcode)qr.src=api.qr(row.barcode.value);
      }
      $('prod-id-producto').setCustomValidity('');
    }finally{busy=false;}
    notify();return mother;
  }
  function applyCode(code,input){
    const clean=normal(code);if(!clean||!input)throw Error('Código vacío o campo no disponible.');
    if(input.id==='prod-barcode'){
      rebase(clean,{physical:true});api.mainBarcodeMode?.();input.value=clean;input.dataset.autoBarcode='0';notify();return clean;
    }
    const row=rows().find(r=>r.barcode===input);if(!row)throw Error('No se encontró la variante de destino.');
    const plan=[{id:value('prod-id'),code:normal($('prod-barcode')?.value)},...rows().map(r=>({id:r===row?clean:r.id.value,code:r===row?clean:normal(r.barcode?.value)}))];
    validate(plan);busy=true;
    try{
      const toggle=row.root.querySelector('.var-barcode-mode');if(toggle&&!toggle.checked){toggle.checked=true;toggle.dispatchEvent(new Event('change',{bubbles:true}));}
      row.id.value=clean;row.id.dataset.scannedReference='1';row.id.dataset.identityAuto='0';input.value=clean;input.dataset.autoBarcode='0';input.dataset.generatedBarcode=generated(value('prod-id-producto'),clean);input.setCustomValidity('');
    }finally{busy=false;}
    notify();return clean;
  }
  function adopt({preserve=false,mother=value('prod-id-producto')}={}){if($('product-form'))$('product-form').dataset.identityMother=mother;
    for(const row of [main(),...rows()]){
      if(!row.id)continue;const auto=preserve&&row.id.dataset.identityAuto!==undefined?row.id.dataset.identityAuto==='1':row.id.dataset.scannedReference!=='1'&&key(row.id.value).startsWith(key(mother)+'-V');row.id.dataset.identityAuto=auto?'1':'0';
      if(row.barcode){row.barcode.dataset.identityMother=mother;const code=generated(mother,row.id.value);row.barcode.dataset.generatedBarcode=code;
        if(row.barcode.dataset.autoBarcode!=='0')row.barcode.dataset.autoBarcode=row.barcode.value&&normal(row.barcode.value)!==code?'0':'1';}
    }
    notify();
  }
  function next(mother){
    if(generated(mother,mother+'-V01')===generated(mother,mother+'-V02'))throw Error('Acorta el ID madre para que cada referencia y QR sean únicos.');
    const used=new Set([value('prod-id'),$('prod-barcode')?.value,...rows().flatMap(r=>[r.id.value,r.barcode?.value]),...(api.inventory?.()||[]).flatMap(p=>[api.inventoryId(p),api.inventoryBarcode(p)])].map(key));
    used.add(key(mother+'-V01'));let n=2;while(used.has(key(mother+'-V'+String(n).padStart(2,'0')))||used.has(key(generated(mother,mother+'-V'+String(n).padStart(2,'0')))))n++;return mother+'-V'+String(n).padStart(2,'0');
  }
  function initialize(options){
    api=options;if(initialized)return;initialized=true;
    if($('prod-id-producto'))$('prod-id-producto').readOnly=false;
    document.addEventListener('input',event=>{
      if(busy)return;const input=event.target;
      if(input.matches('#prod-id-producto,#prod-barcode,.var-id,.ve-id,.var-barcode,.ve-barcode,#prod-id'))input.setCustomValidity('');
      try{
        if(input.id==='prod-id-producto')rebase(input.value);
        else if(input.matches('#prod-barcode,.var-barcode,.ve-barcode')&&input.value.trim())applyCode(input.value,input);
        else if(input.matches('.var-id,.ve-id,#prod-id')){
          input.dataset.identityAuto='0';input.dataset.scannedReference='0';const row=input.id==='prod-id'?main():rows().find(r=>r.id===input);if(row)refreshCode(row,value('prod-id-producto'),input.dataset.previousId||input.value);notify();
        }
      }catch(error){input.setCustomValidity(error.message);api.error?.(error.message);}
    },true);
    document.addEventListener('change',event=>{if(!busy&&event.target.id==='prod-id-producto'){try{rebase(event.target.value);}catch(error){event.target.setCustomValidity(error.message);api.error?.(error.message);}}},true);
    new MutationObserver(records=>{
      if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('.var-id,.ve-id')||n.querySelector?.('.var-id,.ve-id'))))){
        for(const row of rows())if(!row.barcode?.dataset.identityMother){refreshCode(row,value('prod-id-producto'),row.id.value);row.id.dataset.identityAuto=row.id.dataset.scannedReference==='1'?'0':/^.+-V\d+$/i.test(row.id.value)?'1':'0';}
        notify();
      }
    }).observe($('variants-container'),{childList:true,subtree:true});
    adopt();
  }
  function assertValid(){if(!value('prod-id-producto'))throw Error('Escribe un ID madre antes de guardar.');validate([{id:value('prod-id'),code:normal($('prod-barcode')?.value)},...rows().map(r=>({id:r.id.value,code:normal(r.barcode?.value)}))]);if(!$('prod-id-producto').checkValidity())throw Error($('prod-id-producto').validationMessage);return true;}
  window.OriginalStoreProductIdentity={initialize,rebase,applyCode,adopt,next,assertValid};
})();
