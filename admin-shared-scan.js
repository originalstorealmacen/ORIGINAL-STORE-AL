/* Original Store: the existing camera sends codes; product saving remains on the PC. */
(() => {
  'use strict';
  let api, form, panel, pc=null, phone=null, target=null, epoch=crypto.randomUUID(), formId=crypto.randomUUID();
  const tabId=crypto.randomUUID(),deviceId=crypto.randomUUID();
  let streamController, heartbeat, stopping=false, pending=null, applying=false, queue=Promise.resolve(), generation=0;
  const receipts=new Map();
  const seen=new Set(), $=id=>panel.querySelector('[data-scan="'+id+'"]');
  const pairHash=location.hash.startsWith('#os-scan=')?location.hash.slice(9):'';
  if(pairHash)history.replaceState(null,'',location.pathname+location.search);
  const context=()=>[document.getElementById('prod-id')?.value,form?.dataset.originalVariationId||'',epoch].join('|');
  const matches=(a,b)=>a&&b&&a.formId===b.formId&&a.epoch===b.epoch&&a.targetId===b.targetId;
  const message=(value,bad=false)=>{if(!panel)return;$('status').textContent=value;$('status').classList.toggle('is-error',bad);};
  const identity=()=>pc?{sessionId:pc.sessionId,pcToken:pc.pcToken,tabId}:phone?{sessionId:phone.sessionId,phoneToken:phone.phoneToken,deviceId}:{};
  async function request(action,extra={},signal){
    if(!api?.getCredential())throw Error('Inicia sesión con la cuenta administradora de Original Store.');
    for(let attempt=0;attempt<3;attempt++){
      const response=await api.fetcher(window.ORIGINAL_STORE_API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,adminCredential:api.getCredential(),...identity(),...extra}),signal});
      if(action==='scanstream'&&response.headers.get('Content-Type')?.includes('text/event-stream'))return response;
      const result=await response.json();
      if(result.ok)return result;
      if(attempt<2&&/Otra operación/.test(result.error||'')){await new Promise(r=>setTimeout(r,120+Math.random()*180));continue;}
      throw Error(result.error||'No se pudo conectar el escáner.');
    }
  }
  function targetOptions(){
    if(!panel)return;
    const selected=$('target').value;$('target').replaceChildren();
    document.querySelectorAll('#prod-barcode,.var-barcode,.ve-barcode').forEach((input,i)=>{
      if(!input.id)input.id='os-barcode-'+crypto.randomUUID();
      if(input.disabled)return;
      const option=document.createElement('option');option.value=input.id;
      option.textContent=input.id==='prod-barcode'?'Código del producto':input.classList.contains('ve-barcode')?'Variante en edición '+(input.closest('[data-vid]')?.dataset.vid||input.id.replace('ve-barcode-','')):'Código de variante '+i;
      $('target').append(option);
    });
    if([...$('target').options].some(o=>o.value===selected))$('target').value=selected;
  }
  function reveal(input){
    if(input.id==='prod-barcode')api.barcodeMode?.();
    else {const toggle=input.closest('.admin-panel')?.querySelector('.var-barcode-mode');if(toggle&&!toggle.checked){toggle.checked=true;toggle.dispatchEvent(new Event('change',{bubbles:true}));}}
    let fold=input.closest('details');while(fold){fold.open=true;fold=fold.parentElement?.closest('details');}
  }
  function currentTarget(){
    const input=document.getElementById($('target').value);if(!input)return null;
    return {formId,epoch,targetId:input.id,label:[document.getElementById('prod-nombre')?.value,document.getElementById('prod-id')?.value,$('target').selectedOptions[0]?.textContent].filter(Boolean).join(' · ').slice(0,120)};
  }
  function updatePhone(state){
    if(!phone)return;
    phone.target=state.target;phone.expires=state.expires||phone.expires;
    $('destination').textContent='Destino: '+(state.target?.label||'Esperando formulario del computador');
    if(state.lastAck&&pending?.eventId===state.lastAck.eventId){
      const accepted=state.lastAck.accepted;receipts.set(pending.eventId,accepted);pending=null;$('retry').hidden=true;
      message(accepted?'Código recibido en el computador. Puedes escanear el siguiente.':'El formulario cambió. Escanea de nuevo.',!accepted);
    }
    $('scan').disabled=!phone.target||!!pending||state.pcOnline===false;
  }
  async function receive(reading){
    if(!pc||!reading||!reading.eventId)return;
    const input=document.getElementById(reading.target?.targetId);
    const accepted=Date.now()<pc.expires&&matches(target,reading.target)&&pc.context===context()&&input?.isConnected&&!input.disabled&&input.getClientRects().length>0;
    if(accepted&&!seen.has(reading.eventId)){
      seen.add(reading.eventId);applying=true;
      input.value=reading.value;input.dataset.autoBarcode='0';
      input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));applying=false;
      message('Recibido: '+reading.value+' · El producto sigue sin guardar.');
    }
    try{await request('scanack',{eventId:reading.eventId,accepted});}catch(e){message('Lectura recibida; reconectando la confirmación…',true);}
  }
  function handle(event,data){
    if(event==='closed'||event==='expired'){stopLocal();message('La vinculación terminó. Crea una nueva para continuar.');return;}
    if(event==='ready'){status();return;}
    if(pc){if(event==='scan')receive(data);if(data.pending)receive(data.pending);if(event==='joined')message('Celular vinculado. Esperando lecturas…');}
    if(phone){if(event==='target'||event==='ready')updatePhone(data);if(event==='ack')updatePhone({target:phone.target,lastAck:data});}
  }
  async function status(){
    if(!pc&&!phone)return;
    try{const state=await request('scanstatus');if(pc&&state.pending)await receive(state.pending);if(phone)updatePhone(state);}catch(e){message(e.message,true);if(/venció|pertenece|Inicia sesión/.test(e.message))stopLocal();}
  }
  async function stream(run){
    while(!stopping&&run===generation&&(pc||phone)){
      streamController=new AbortController();
      try{
        const response=await request('scanstream',{},streamController.signal),reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
        await status();
        while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;
          while((end=buffer.indexOf('\n\n'))>=0){const chunk=buffer.slice(0,end);buffer=buffer.slice(end+2);const event=chunk.match(/^event: (.+)$/m)?.[1],data=chunk.match(/^data: (.+)$/m)?.[1];if(event&&data&&run===generation)handle(event,JSON.parse(data));}
        }
      }catch(e){if(e.name!=='AbortError'&&run===generation)message('Reconectando el escáner…',true);}
      if(run===generation&&!stopping)await new Promise(r=>setTimeout(r,800));
    }
  }
  function startConnection(){stopping=false;const run=++generation;clearInterval(heartbeat);heartbeat=setInterval(status,15000);stream(run);}
  function stopLocal(){
    stopping=true;++generation;streamController?.abort();clearInterval(heartbeat);pc=null;phone=null;target=null;pending=null;seen.clear();
    if(panel){$('pair').hidden=true;$('scan').hidden=true;$('retry').hidden=true;$('disconnect').hidden=true;$('create').disabled=false;$('join').disabled=false;$('target').disabled=false;$('destination').textContent='';}
  }
  async function close(){try{if(pc||phone)await request(pc?'scanclose':'scanunlink');}catch{}stopLocal();api?.closeScanner?.();message('Escáner desvinculado. Los campos se conservan.');}
  async function create(){
    try{
      if(pc||phone)await close();targetOptions();target=currentTarget();if(!target)throw Error('Abre un formulario de producto.');
      reveal(document.getElementById(target.targetId));
      $('create').disabled=true;const created=await request('scancreate',{tabId,target});
      pc={...created,context:context()};$('join').disabled=true;$('disconnect').hidden=false;$('pair').hidden=false;
      const link=location.origin+location.pathname+'#os-scan='+created.sessionId+'.'+created.pairCode;
      $('link').value=link;$('qr').src='';
      // Reuse the bundled QR encoder. Pairing secrets never go to a remote QR image service.
      if(typeof window.qrcode==='function'){
        const qr=window.qrcode(0,'L');qr.addData(link);qr.make();$('qr').src=qr.createDataURL(5,4);
      }

      startConnection();message('Desde el celular entra con la misma cuenta y pulsa Vincular celular. La sesión dura 30 minutos.');
    }catch(e){$('create').disabled=false;message(e.message,true);}
  }
  function parsePair(value){
    let raw=String(value).trim();if(raw.includes('#os-scan='))raw=raw.split('#os-scan=')[1];
    if(!/^[0-9a-f-]{36}\.[0-9a-f]{48}$/i.test(raw))throw Error('Escanea el QR de vinculación que aparece en el computador.');
    const [sessionId,pairCode]=raw.split('.');return {sessionId,pairCode};
  }
  async function join(value){
    try{const pair=parsePair(value);if(pc||phone)await close();$('join').disabled=true;
      const state=await request('scanjoin',{...pair,deviceId});phone={...state,sessionId:pair.sessionId};$('create').disabled=true;$('target').disabled=true;$('disconnect').hidden=false;$('scan').hidden=false;
      updatePhone(state);startConnection();message('Vinculado. Abre el escáner para enviar códigos al computador.');
    }catch(e){$('join').disabled=false;message(e.message,true);}
  }
  async function send(value){
    if(!phone||pending||!phone.target)throw Error('Espera la confirmación o vuelve a vincular el celular.');
    const read={eventId:crypto.randomUUID(),value,target:{...phone.target}};pending=read;
    return transmit(read);
  }
  async function transmit(read){
    $('scan').disabled=true;$('retry').hidden=true;message('Enviando '+read.value+'…');
    try{
      const state=await request('scansend',read);updatePhone(state);
      const deadline=Date.now()+12000;
      while(pending?.eventId===read.eventId&&Date.now()<deadline){await new Promise(r=>setTimeout(r,350));}
      if(pending?.eventId===read.eventId){await status();if(pending)throw Error('Sin confirmación del computador. Revisa la conexión y pulsa Reintentar envío.');}
      if(receipts.get(read.eventId)===false)throw Error('El formulario cambió. Vuelve a escanear.');
      receipts.delete(read.eventId);
    }catch(e){if(pending?.eventId===read.eventId){try{await status();}catch{}}
      if(pending?.eventId===read.eventId)$('retry').hidden=false;
      message(e.message,true);throw e;
    }
  }
  function invalidate(){
    epoch=crypto.randomUUID();target=null;if(!pc)return;
    pc.context='';message('Actualizando el campo de destino…');
    queue=queue.catch(()=>{}).then(async()=>{
      if(!pc)return;targetOptions();const next=currentTarget();if(!next){await close();return;}
      const snapshot=context();reveal(document.getElementById(next.targetId));
      target=next;pc.context=snapshot;
      try{await request('scantarget',{target:next});if(pc&&context()===snapshot)message('Destino preparado. Puedes escanear desde el celular.');}catch(e){if(pc&&context()===snapshot){target=null;pc.context='';}message(e.message,true);}
    });
  }
  function initialize(options){
    if(panel)return;api=options;form=document.getElementById('product-form');if(!form)return;
    panel=document.createElement('section');panel.className='os-shared-scan';panel.setAttribute('aria-label','Escáner compartido');
    panel.innerHTML='<div class="os-scan-heading"><div><strong>Escáner compartido</strong><small>Celular + computador · Original Store</small></div><span>Sesión temporal</span></div><div class="os-scan-actions"><button type="button" class="admin-btn" data-scan="create">Vincular desde este PC</button><button type="button" class="admin-btn secondary" data-scan="join">Vincular celular</button><button type="button" class="admin-btn secondary" data-scan="scan" hidden>Abrir escáner del celular</button><button type="button" class="admin-btn secondary" data-scan="retry" hidden>Reintentar envío</button><button type="button" class="admin-btn secondary" data-scan="disconnect" hidden>Desvincular</button></div><label class="os-scan-target">Recibir el código en<select class="form-control" data-scan="target"></select></label><div class="os-scan-pair" data-scan="pair" hidden><img data-scan="qr" alt="QR temporal para vincular el celular"><div><p>En el celular inicia sesión con la misma cuenta y elige <b>Vincular celular</b>. Escanea este QR con el lector existente.</p><input class="form-control" data-scan="link" readonly aria-label="Enlace temporal de vinculación"><button type="button" class="admin-btn secondary" data-scan="copy">Copiar enlace temporal</button></div></div><p data-scan="destination"></p><p data-scan="status" role="status" aria-live="polite">Solo se transfiere el código escaneado. Tú decides cuándo guardar.</p>';
    form.before(panel);targetOptions();
    $('create').onclick=create;$('disconnect').onclick=close;$('target').onchange=invalidate;
    $('copy').onclick=()=>navigator.clipboard.writeText($('link').value).then(()=>message('Enlace copiado. Ábrelo en el celular con tu cuenta.')).catch(()=>{$('link').select();message('Selecciona y copia el enlace temporal.');});
    $('join').onclick=()=>api.openScanner({preserveRawValue:true,scannerMode:'qr',onDetected:join});
    $('scan').onclick=()=>api.openScanner({continuous:true,onDetected:send});
    $('retry').onclick=()=>{if(pending)transmit(pending).catch(()=>{});};
    form.addEventListener('reset',()=>{invalidate();setTimeout(invalidate,0);});
    document.addEventListener('input',event=>{if(!applying&&['prod-id','prod-id-producto'].includes(event.target.id))invalidate();});
    new MutationObserver(records=>{
      const changed=records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&(n.matches?.('.var-barcode,.ve-barcode')||n.querySelector?.('.var-barcode,.ve-barcode'))));
      if(changed){targetOptions();if(pc&&target&&!document.getElementById(target.targetId))invalidate();}
    }).observe(document.body,{childList:true,subtree:true});
    document.addEventListener('focusin',event=>{if(event.target.matches('#prod-barcode,.var-barcode,.ve-barcode')&&$('target').value!==event.target.id){$('target').value=event.target.id;invalidate();}});
    if(pairHash)join(pairHash);
    window.addEventListener('pagehide',()=>{if(pc||phone){request(pc?'scanclose':'scanunlink').catch(()=>{});}stopLocal();});
  }
  window.OriginalStoreSharedScan={initialize,invalidate,close};
})();
