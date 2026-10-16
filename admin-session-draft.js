/* Activity and draft persistence only. Credentials are never written to storage. */
(() => {
  'use strict';
  const IDLE=30*60*1000, DRAFT_KEY='original_store_product_draft_v1';
  let api,owner='',lastActivity=0,expires=Infinity,timer,checking=false,locked=true,restoring=false,ready=false,saveTimer,hasLiveDraft=false,revision=0;
  const metaKeys=['autoBarcode','generatedBarcode','scannedReference','identityMother','identityAuto','uploadState','entryHiddenValue'];
  function fieldState(input,selector){
    const metadata={};for(const name of metaKeys)if(input.dataset[name]!==undefined)metadata[name]=input.dataset[name];
    return {selector,validation:input.validity?.customError?input.validationMessage:'',value:input.type==='checkbox'||input.type==='radio'?input.checked:input.value,metadata};
  }
  function capture(){
    const form=document.getElementById('product-form');if(!form)return null;
    const main=[...form.querySelectorAll('input[id],select[id],textarea[id]')].filter(input=>/^(prod-|variation-)/.test(input.id)&&!['password','file','button','submit'].includes(input.type)).map(input=>fieldState(input,'#'+input.id));
    const variants=[...document.querySelectorAll('#variants-container .admin-panel,#variants-container .variant-edit-card')].filter(root=>root.querySelector('.var-id,.ve-id')).map(root=>{
      const saved=root.classList.contains('variant-edit-card'),row=saved?root.querySelector('.var-edit-expanded'):root;
      return {kind:saved?'saved':'new',originalId:row?.dataset.originalVarid||root.dataset.varid||'',fields:[...root.querySelectorAll('input,select,textarea')].filter(input=>!['password','file','button','submit'].includes(input.type)).flatMap(input=>{
        const name=[...input.classList].find(name=>/^(var-|ve-)/.test(name));return name?[fieldState(input,'.'+name)]:[];
      }),open:row?getComputedStyle(row).display!=='none':true};
    });
    return {version:1,owner,updated:Date.now(),originalVariationId:form.dataset.originalVariationId||'',pendingKey:form.dataset.pendingKey||'',identityMother:form.dataset.identityMother||'',main,variants};
  }
  function save(){
    clearTimeout(saveTimer);if(!owner||!ready||restoring)return;
    try{const draft=capture();if(draft)sessionStorage.setItem(DRAFT_KEY,JSON.stringify(draft));}catch{api?.message?.('No se pudo conservar el borrador en esta pestaña.');}
  }
  function applyFields(root,fields){
    for(const field of fields||[]){
      if(!/^#[a-zA-Z0-9_-]+$|^\.(var-|ve-)[a-zA-Z0-9_-]+$/.test(field.selector))continue;
      const input=root.querySelector(field.selector);if(!input||['password','file'].includes(input.type))continue;
      if(input.type==='checkbox'||input.type==='radio')input.checked=field.value===true;else input.value=String(field.value??'');
      input.setCustomValidity(String(field.validation||''));
      for(const name of metaKeys){delete input.dataset[name];if(field.metadata?.[name]!==undefined)input.dataset[name]=String(field.metadata[name]);}
    }
  }
  async function restore(){
    if(ready)return;restoring=true;
    try{
      let draft;try{draft=JSON.parse(sessionStorage.getItem(DRAFT_KEY)||'null');}catch{}
      if(draft?.version===1&&draft.owner===owner&&!hasLiveDraft){
        api.resetForm();const form=document.getElementById('product-form');
        applyFields(form,draft.main);if(draft.originalVariationId)form.dataset.originalVariationId=draft.originalVariationId;else delete form.dataset.originalVariationId;
        if(draft.pendingKey)form.dataset.pendingKey=draft.pendingKey;api.setEditing(!!draft.originalVariationId);
        const container=document.getElementById('variants-container');container.replaceChildren();
        for(const variant of draft.variants||[]){
          const root=api.addDraftVariant(variant);if(root){window.OriginalStoreRetailPricing?.sync();applyFields(root,variant.fields);api.finishDraftVariant?.(root,variant);}
        }
        api.refreshDraft?.(draft);api.message?.('Borrador recuperado. Revisa los datos antes de guardar.');
      }
      hasLiveDraft=true;ready=true;
    }finally{restoring=false;}
  }
  function lock(reason){
    if(locked)return;save();locked=true;clearInterval(timer);api.lock(reason);api.message?.(reason+' Tu borrador se conserva en esta pestaña.');
  }
  async function check(){
    if(locked)return;
    if(Date.now()>=expires){lock('La credencial venció. Inicia sesión nuevamente.');return;}
    if(Date.now()-lastActivity>=IDLE){lock('Administrador bloqueado por inactividad.');return;}
    if(checking||Date.now()-(api.lastCheck||0)<60000)return;
    checking=true;const run=revision;api.lastCheck=Date.now();
    try{const result=await api.validate();if(run===revision&&result===false)lock('La sesión venció. Inicia sesión nuevamente.');}catch{/* Network outages neither extend credentials nor count as activity. */}finally{checking=false;}
  }
  function activity(){
    if(locked)return;
    if(Date.now()>=expires||Date.now()-lastActivity>=IDLE){check();return;}
    lastActivity=Date.now();
  }
  function credentialExpires(credential,identity){
    if(Number.isFinite(identity?.expiresAt))return identity.expiresAt;
    try{const payload=JSON.parse(atob(credential.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(Number.isFinite(payload.exp))return payload.exp*1000;}catch{}
    // Non-JWT credentials are validated by the server; do not invent an absolute browser lifetime.
    return Infinity;
  }
  function start(credential,identity={}){
    const nextOwner=String(identity.email||'').toLowerCase();if(!nextOwner)throw Error('No se pudo identificar la cuenta administradora.');
    if(owner&&owner!==nextOwner){restoring=true;try{api.resetForm();}finally{restoring=false;}hasLiveDraft=false;}
    ++revision;owner=nextOwner;lastActivity=Date.now();expires=credentialExpires(credential,identity);locked=false;api.lastCheck=0;ready=false;clearInterval(timer);timer=setInterval(check,1000);
  }
  function initialize(options){
    if(api)return;api=options;
    for(const event of ['pointerdown','pointermove','keydown','input','wheel','touchstart'])document.addEventListener(event,e=>{if(e.isTrusted)activity();},{capture:true,passive:true});
    for(const event of ['input','change'])document.addEventListener(event,e=>{
      if(!locked&&!restoring&&e.target.closest?.('#product-form,#variants-container')){clearTimeout(saveTimer);saveTimer=setTimeout(save,350);}
    });
    document.addEventListener('original-store:identity-updated',()=>{if(!locked&&!restoring){clearTimeout(saveTimer);saveTimer=setTimeout(save,350);}});
    document.addEventListener('visibilitychange',check);
    window.addEventListener('pagehide',()=>{save();locked=true;clearInterval(timer);api.exit();});
    window.addEventListener('pageshow',event=>{if(event.persisted)api.showLogin?.();});
  }
  function clearDraft(){clearTimeout(saveTimer);try{sessionStorage.removeItem(DRAFT_KEY);}catch{}hasLiveDraft=true;}
  window.OriginalStoreAdminSession={initialize,start,restore,save,activity,check,clearDraft,stop(){++revision;clearInterval(timer);locked=true;}};
})();
