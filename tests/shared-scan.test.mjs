import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedScanAction} from '../supabase/functions/original-store-api/shared-scan.js';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture(){
 let clock=Date.now(),commits=0;const items=new Map(),messages=[];
 const cache={get:k=>items.get(k),put:(k,v)=>items.set(k,v),remove:k=>items.delete(k)};
 const run=(body,owner='originalstorealmacen@gmail.com',extra={})=>sharedScanAction({body,owner,cache,checkpoint:async()=>{commits++;},env:k=>({SUPABASE_URL:'https://project.invalid',SUPABASE_SERVICE_ROLE_KEY:'PRIVATE-KEY'})[k],now:()=>clock,fetcher:async(url,options)=>{const data=JSON.parse(options.body);assert.equal(data.messages[0].private,true);messages.push(...data.messages);return Response.json({});},...extra});
 return {run,items,messages,advance:n=>{clock+=n;},commits:()=>commits};
}
async function pair(f){
 const tabId=crypto.randomUUID(),target={formId:crypto.randomUUID(),epoch:crypto.randomUUID(),targetId:'prod-barcode',label:'Producto de prueba'};
 const created=await f.run({action:'scancreate',tabId,target});assert.equal(created.ok,true);
 const deviceId=crypto.randomUUID(),joined=await f.run({action:'scanjoin',sessionId:created.sessionId,pairCode:created.pairCode,deviceId});assert.equal(joined.ok,true);
 const pc={sessionId:created.sessionId,tabId,pcToken:created.pcToken},phone={sessionId:created.sessionId,deviceId,phoneToken:joined.phoneToken};
 return {created,pc,phone,target,join:joined};
}
test('pairing is administrator-bound, single use, and bound to its exact tab and phone',async()=>{
 const f=fixture(),p=await pair(f);
 assert.equal((await f.run({action:'scanstatus',...p.pc},'other@example.invalid')).ok,false);
 assert.equal((await f.run({action:'scanstatus',...p.pc,tabId:crypto.randomUUID()})).ok,false);
 assert.equal((await f.run({action:'scanstatus',...p.phone,deviceId:crypto.randomUUID()})).ok,false);
 assert.equal((await f.run({action:'scanjoin',sessionId:p.created.sessionId,pairCode:p.created.pairCode,deviceId:crypto.randomUUID()})).ok,false);
 assert.ok(![...f.items.values()].join('').includes(p.created.pcToken));assert.ok(![...f.items.values()].join('').includes(p.join.phoneToken));
 assert.ok(!JSON.stringify(f.messages).includes('PRIVATE-KEY'));
});
test('consecutive codes persist until acknowledged, replay is idempotent and only PC can acknowledge',async()=>{
 const f=fixture(),p=await pair(f);
 for(const value of ['7701234567890','ORIGINAL-PROD-01']){
  const eventId=crypto.randomUUID(),body={action:'scansend',...p.phone,target:p.target,eventId,value};
  const first=await f.run(body);assert.equal(first.ok,true);assert.equal(first.pending.value,value);
  const repeat=await f.run(body);assert.equal(repeat.sequence,first.sequence);
  assert.equal((await f.run({...body,eventId:crypto.randomUUID()})).ok,false);
  assert.equal((await f.run({action:'scanack',...p.phone,eventId,accepted:true})).ok,false);
  assert.equal((await f.run({action:'scanack',...p.pc,eventId,accepted:true})).pending,null);
  assert.equal((await f.run(body)).duplicate,true);
 }
});
test('form changes reject stale readings and explicitly reject pending acknowledgements',async()=>{
 const f=fixture(),p=await pair(f),eventId=crypto.randomUUID();
 await f.run({action:'scansend',...p.phone,target:p.target,eventId,value:'ABC'});
 const target={...p.target,epoch:crypto.randomUUID()};
 const result=await f.run({action:'scantarget',...p.pc,target});assert.deepEqual(result.lastAck,{eventId,accepted:false});assert.equal(result.pending,null);
 assert.equal((await f.run({action:'scansend',...p.phone,target:p.target,eventId:crypto.randomUUID(),value:'OLD'})).ok,false);
 assert.equal((await f.run({action:'scantarget',...p.phone,target})).ok,false);
});
test('expiry, inactive PCs, disconnection and malformed readings block delivery',async()=>{
 const f=fixture(),p=await pair(f);
 for(const value of ['', 'x'.repeat(257),'ABC\nDEF'])assert.equal((await f.run({action:'scansend',...p.phone,target:p.target,eventId:crypto.randomUUID(),value})).ok,false);
 f.advance(46000);assert.equal((await f.run({action:'scansend',...p.phone,target:p.target,eventId:crypto.randomUUID(),value:'ABC'})).ok,false);
 await f.run({action:'scanstatus',...p.pc});assert.equal((await f.run({action:'scanunlink',...p.phone})).ok,true);
 assert.equal((await f.run({action:'scanstatus',...p.pc})).ok,false);
 const second=await pair(f);f.advance(30*60*1000+1);assert.equal((await f.run({action:'scanstatus',...second.pc})).ok,false);
});
test('streams subscribe privately, forward events and release subscriptions on cancellation',async()=>{
 const f=fixture(),p=await pair(f);let options,stopped=false;
 const response=await f.run({action:'scanstream',...p.pc},undefined,{subscribe:o=>{options=o;return ()=>{stopped=true;};}});
 const reader=response.body.getReader();options.onReady();assert.match(new TextDecoder().decode((await reader.read()).value),/event: ready/);
 options.onMessage('scan',{value:'ABC'});assert.match(new TextDecoder().decode((await reader.read()).value),/ABC/);
 await reader.cancel();assert.equal(stopped,true);assert.equal(options.topic,'original-store-scan-'+p.created.sessionId);
});
test('a stream ending at the lease boundary cannot forward subsequent readings',async()=>{
 const f=fixture(),p=await pair(f);f.advance(30*60*1000-20);let stopped=false;
 const response=await f.run({action:'scanstream',...p.pc},undefined,{subscribe:()=>()=>{stopped=true;}}),reader=response.body.getReader();
 await reader.read();assert.equal((await reader.read()).done,true);assert.equal(stopped,true);
});
test('failed Realtime broadcasts retain the reading for acknowledgement after reconnection',async()=>{
 const f=fixture(),p=await pair(f);
 const result=await f.run({action:'scansend',...p.phone,target:p.target,eventId:crypto.randomUUID(),value:'RECOVER'},undefined,{fetcher:async()=>{throw Error('offline');}});
 assert.equal(result.ok,true);assert.equal(result.delivered,false);assert.equal((await f.run({action:'scanstatus',...p.pc})).pending.value,'RECOVER');
});
test('scanner keeps its normal confirmation and preserves full pairing URLs only when requested',async()=>{
 const source=fs.readFileSync(new URL('../admin-app.js',import.meta.url),'utf8'),start=source.indexOf('function createStableBarcodeHandler('),end=source.indexOf('\nasync function startHtml5BarcodeCamera',start);
 const context=vm.createContext({Date,Promise,window:{setTimeout:fn=>fn()},normalizeBarcodeValue:v=>v.toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,48),getBarcodeFormatLabel:f=>f==='qr_code'?'QR':f});
 vm.runInContext(source.slice(start,end),context);
 const found=[],normal=context.createStableBarcodeHandler({onConfirmed:c=>found.push(c)});assert.equal(normal('abc 123'),false);assert.equal(normal('abc 123'),true);assert.deepEqual(found,['ABC123']);
 const url='https://aloriginalstore.online/administrativo.html#os-scan='+crypto.randomUUID()+'.'+'a'.repeat(48);
 const raw=context.createStableBarcodeHandler({onConfirmed:c=>found.push(c),confirmQrImmediately:true,normalizeValue:v=>v});assert.equal(raw(url,'qr_code'),true);assert.equal(found[1],url);
 const continuous=context.createStableBarcodeHandler({onConfirmed:async c=>found.push(c),confirmQrImmediately:true,continuous:true});
 assert.equal(continuous('one','qr_code'),false);await new Promise(r=>setTimeout(r,0));continuous('one','qr_code');assert.equal(found.filter(v=>v==='ONE').length,1);
 continuous('two','qr_code');await new Promise(r=>setTimeout(r,0));assert.equal(found.at(-1),'TWO');
});
