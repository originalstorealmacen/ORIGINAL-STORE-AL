import {createHash, randomBytes} from 'node:crypto';

const TTL=30*60*1000, PRESENCE=45000;
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const hash=v=>createHash('sha256').update(String(v||'')).digest('hex');
const secret=()=>randomBytes(24).toString('hex');
const text=(v,n=120)=>String(v||'').trim().slice(0,n);
const fail=error=>({ok:false,error});
function destination(v){
  if(!v||!uuid(v.formId)||!uuid(v.epoch)||!/^[-a-zA-Z0-9_:]{1,120}$/.test(v.targetId||''))return null;
  return {formId:v.formId,epoch:v.epoch,targetId:v.targetId,label:text(v.label)};
}
const same=(a,b)=>a&&b&&a.formId===b.formId&&a.epoch===b.epoch&&a.targetId===b.targetId;
const publicState=(s,clock=Date.now())=>({expires:s.expires,target:s.target,joined:!!s.phoneHash,sequence:s.sequence,pending:s.pending,lastAck:s.lastAck,pcOnline:clock-s.pcSeen<PRESENCE});

// Private Realtime is reached only through an authenticated server stream. No secret keys reach the browser.
export async function sharedScanAction({body,owner,cache,checkpoint,env,fetcher=fetch,subscribe,now=()=>Date.now(),headers={},signal}){
  const action=body.action,reply=value=>value;
  if(!owner)return fail('Inicia sesión con tu cuenta administradora.');
  const topic=id=>'original-store-scan-'+id;
  async function broadcast(s,event,payload){
    const base=(env('SUPABASE_URL')||'').replace(/\/$/,''),key=env('SUPABASE_SERVICE_ROLE_KEY');
    if(!base||!key)return false;
    try{
      const response=await fetcher(base+'/realtime/v1/api/broadcast',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({messages:[{topic:topic(s.id),event,payload,private:true}]}),signal:AbortSignal.timeout(8000)});
      return response.ok;
    }catch{return false;}
  }
  async function save(s){cache.put('original-store-scan:'+s.id,JSON.stringify(s),Math.max(1,Math.ceil((s.expires-now())/1000)));await checkpoint([]);}
  if(action==='scancreate'){
    const target=destination(body.target);
    if(!target||!uuid(body.tabId))return fail('Selecciona un campo válido.');
    const pairCode=secret(),pcToken=secret(),id=crypto.randomUUID();
    const s={id,owner:owner.toLowerCase(),tabId:body.tabId,pcHash:hash(pcToken),pairHash:hash(pairCode),phoneHash:'',deviceId:'',created:now(),expires:now()+TTL,pcSeen:now(),target,sequence:0,pending:null,lastAck:null};
    await save(s);return {ok:true,sessionId:id,pairCode,pcToken,...publicState(s,now())};
  }
  if(!uuid(body.sessionId))return fail('Vinculación no válida.');
  let s;try{s=JSON.parse(cache.get('original-store-scan:'+body.sessionId)||'null');}catch{}
  if(!s||s.closed||s.expires<=now()||s.owner!==owner.toLowerCase())return fail('La vinculación venció o no pertenece a tu cuenta.');
  if(action==='scanjoin'){
    if(s.phoneHash||!uuid(body.deviceId)||hash(body.pairCode)!==s.pairHash||now()-s.pcSeen>PRESENCE)return fail('Este enlace venció, está ocupado o el computador está desconectado.');
    const phoneToken=secret();s.phoneHash=hash(phoneToken);s.deviceId=body.deviceId;s.pairHash='';
    await save(s);await broadcast(s,'joined',{});
    return {ok:true,phoneToken,...publicState(s,now())};
  }
  const pc=hash(body.pcToken)===s.pcHash&&body.tabId===s.tabId;
  const phone=!!s.phoneHash&&hash(body.phoneToken)===s.phoneHash&&body.deviceId===s.deviceId;
  if(!pc&&!phone)return fail('Esta pestaña o dispositivo no está vinculado.');
  if(action==='scanstream'){
    if(typeof subscribe!=='function')return fail('La conexión en tiempo real no está disponible.');
    const encoder=new TextEncoder();let stop,ended=false,timer,abort;
    const stream=new ReadableStream({
      start(controller){
        const emit=(event,payload)=>{if(ended)return;try{controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));}catch{finish();}};
        const finish=()=>{if(ended)return;ended=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);try{stop?.();}catch{}try{controller.close();}catch{}};
        abort=finish;signal?.addEventListener('abort',abort,{once:true});
        timer=setTimeout(()=>{emit(s.expires<=now()?'expired':'reconnect',{});finish();},Math.max(1,Math.min(30000,s.expires-now())));
        stop=subscribe({topic:topic(s.id),onReady:()=>emit('ready',publicState(s,now())),onMessage(event,payload){if(s.expires<=now()){emit('expired',{});finish();return;}emit(event,payload);if(event==='closed')finish();},onError(){emit('reconnect',{});finish();}});
        if(ended)stop?.();if(signal?.aborted)finish();
      },cancel(){ended=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);try{stop?.();}catch{}}
    });
    return new Response(stream,{headers:{...headers,'Content-Type':'text/event-stream','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'}});
  }
  if(action==='scanstatus'){
    if(pc){s.pcSeen=now();await save(s);}return {ok:true,...publicState(s,now()),pcOnline:now()-s.pcSeen<PRESENCE};
  }
  if(action==='scantarget'){
    if(!pc)return fail('Solo el computador elige el campo de destino.');
    const target=destination(body.target);if(!target)return fail('Destino no válido.');
    if(!same(target,s.target)&&s.pending){s.lastAck={eventId:s.pending.eventId,accepted:false};s.pending=null;}
    s.target=target;s.pcSeen=now();await save(s);await broadcast(s,'target',publicState(s,now()));return {ok:true,...publicState(s,now())};
  }
  if(action==='scansend'){
    if(!phone)return fail('Solo el celular vinculado puede enviar lecturas.');
    if(!uuid(body.eventId)||typeof body.value!=='string'||!body.value.trim()||body.value.length>256||/[\x00-\x1f\x7f]/.test(body.value))return fail('El código no es válido.');
    if(s.lastAck?.eventId===body.eventId)return {ok:true,duplicate:true,...publicState(s,now())};
    if(!same(destination(body.target),s.target)||now()-s.pcSeen>PRESENCE)return fail('El formulario cambió o el computador está desconectado. Vuelve a escanear.');
    if(s.pending&&s.pending.eventId!==body.eventId)return fail('Espera la confirmación de la lectura anterior.');
    if(!s.pending)s.pending={eventId:body.eventId,value:body.value.trim(),target:s.target,sequence:++s.sequence};
    await save(s);const delivered=await broadcast(s,'scan',s.pending);return {ok:true,delivered,...publicState(s,now())};
  }
  if(action==='scanack'){
    if(!pc)return fail('Solo el computador confirma las lecturas.');
    if(s.pending?.eventId===body.eventId){s.lastAck={eventId:body.eventId,accepted:body.accepted===true};s.pending=null;await save(s);await broadcast(s,'ack',s.lastAck);}
    return {ok:true,...publicState(s,now())};
  }
  if(action==='scanclose'||action==='scanunlink'){
    if(action==='scanclose'&&!pc||action==='scanunlink'&&!phone)return fail('Dispositivo no autorizado.');
    s.closed=true;s.pairHash='';s.pending=null;await save(s);await broadcast(s,'closed',{});return reply({ok:true});
  }
  return fail('Acción no permitida.');
}
