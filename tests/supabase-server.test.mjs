import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,uploadDrive} from '../supabase/functions/original-store-api/server.js';
import {sealConnection,readConnection} from '../supabase/functions/original-store-api/drive-connection.js';

test('saved Drive connection authenticates ciphertext and is bound to server key',()=>{
  const env=name=>name==='SUPABASE_SERVICE_ROLE_KEY'?'KEY-A':undefined;
  const connection={refreshToken:'PRIVATE',folderId:'FOLDER',folderName:'Imágenes',clientId:'CLIENT'};
  const value=sealConnection(connection,env);
  assert.deepEqual(readConnection({getProperty:()=>value},env),connection);
  assert.throws(()=>readConnection({getProperty:()=>value},()=> 'KEY-B'));
  const parts=value.split('.');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
  assert.throws(()=>readConnection({getProperty:()=>parts.join('.')},env));
});

test('Drive encryption works in Edge runtimes without a global Node Buffer',()=>{
  const previous=globalThis.Buffer;
  try{
    globalThis.Buffer=undefined;
    const env=()=> 'SERVER-KEY',connection={refreshToken:'PRIVATE',folderId:'FOLDER'};
    assert.deepEqual(readConnection({getProperty:()=>sealConnection(connection,env)},env),connection);
  }finally{globalThis.Buffer=previous;}
});

test('Drive upload reads encrypted server connection without returning its token',async()=>{
  let tokenBody;
  const f=fixture({env:{GOOGLE_DRIVE_CLIENT_ID:'CLIENT',GOOGLE_DRIVE_CLIENT_SECRET:'SECRET'},fetcher:async(url,options)=>{
    if(String(url).endsWith('/token')){tokenBody=options.body;return Response.json({access_token:'ACCESS'});}
    if(String(url).includes('/upload/'))return Response.json({id:'NEW-FILE'});
    return Response.json({});
  }});
  f.getState().properties.ORIGINAL_STORE_DRIVE_CONNECTION=sealConnection({refreshToken:'REFRESH',folderId:'FOLDER',clientId:'CLIENT'},name=>name==='SUPABASE_SERVICE_ROLE_KEY'?'TEST-SERVER-KEY':undefined);
  const result=await f.post({action:'uploadimage',adminCredential:'TEST-GOOGLE-ID',mimeType:'image/png',base64Data:'AQID',fileName:'prueba.png'});
  assert.equal(result.ok,true);assert.equal(result.id,'NEW-FILE');assert.equal(tokenBody.get('refresh_token'),'REFRESH');assert.ok(!JSON.stringify(result).includes('REFRESH'));
});

function fixture(overrides={}){
  let state={revision:'1',properties:{BLYXU_ADMIN_EMAILS:'originalstorealmacen@gmail.com'},cache:{}};
  const names=['Productos','Clientes','Pedidos','Facturas','Favoritos','PedidosChina','Configuracion','CuentasPrivadas','SolicitudesAccesoPrivadas','ComprobantesPrivados'];
  const data=Object.fromEntries(names.map(name=>[name,{name,revision:'1',headers:name.includes('Privad')?['ID','Datos']:[],rows:[]}]));
  data.Productos.headers=['ID Variación','ID Producto','SKU','Nombre del Producto','Precio','Precio Mayor','Cantidad'];
  data.Productos.rows=[{id:'1',position:2,record:{'ID Variación':'TEST-V1','ID Producto':'TEST-P1',SKU:'TEST-V1','Nombre del Producto':'Prueba',Precio:1000,'Precio Mayor':700,Cantidad:10}}];
  data.Configuracion.headers=['Clave','Valor'];
  data.Configuracion.rows=[{id:'1',position:2,record:{Clave:'Google_Client_ID',Valor:'TEST-CLIENT'}}];
  let commits=0,conflict=false,clock=Date.now(),googleEmail='originalstorealmacen@gmail.com';
  async function fetcher(url,options={}){
    const target=String(url);
    if(overrides.fetcher&&target.startsWith('https://www.googleapis.com/'))return overrides.fetcher(url,options);
    if(overrides.fetcher&&target==='https://oauth2.googleapis.com/token')return overrides.fetcher(url,options);
    if(target.startsWith('https://oauth2.googleapis.com/tokeninfo'))return Response.json({aud:'TEST-CLIENT',email_verified:true,iss:'https://accounts.google.com',exp:Date.now()/1000+3600,sub:'TEST-SUB',email:googleEmail});
    const method=target.split('/').at(-1),p=JSON.parse(options.body||'{}');
    if(method==='store_load_server')return Response.json({state,datasets:Object.values(data)});
    if(method==='store_read_server_state')return Response.json(state);
    if(method==='store_read_dataset')return Response.json(data[p.dataset_name]);
    if(method==='store_commit_server'){
      if(conflict||String(p.expected_revision)!==state.revision)return Response.json({code:'PT409'},{status:409});
      for(const c of p.changes)if(c.revision!==data[c.name].revision)return Response.json({code:'PT409'},{status:409});
      for(const c of p.changes){const table=data[c.name];table.headers=c.headers;for(const m of c.mutations){if(m.op==='insert')table.rows.push({id:String(table.rows.length+1),position:m.position,record:m.record});if(m.op==='update')table.rows.find(r=>r.id===m.id).record=m.record;if(m.op==='delete')table.rows=table.rows.filter(r=>r.id!==m.id);}if(c.mutations.length||c.headersChanged)table.revision=String(Number(table.revision)+1);}
      state={revision:String(Number(state.revision)+1),properties:p.server_properties,cache:p.server_cache};commits++;return Response.json({ok:true});
    }
    throw new Error('Unexpected test destination');
  }
  const env=name=>({...{ORIGINAL_STORE_API_ENABLED:'true',SUPABASE_SERVICE_ROLE_KEY:'TEST-SERVER-KEY'},...overrides.env}[name]);
  const handler=createHandler({env,fetcher,now:()=>clock});
  const post=body=>handler(new Request('https://test.invalid/functions/v1/original-store-api',{method:'POST',headers:{Origin:'https://aloriginalstore.online'},body:JSON.stringify(body)})).then(r=>r.json());
  return {handler,post,data,getState:()=>state,commits:()=>commits,setConflict:()=>{conflict=true;},advance:ms=>{clock+=ms;},setEmail:value=>{googleEmail=value;}};
}

test('Drive setup requires authorized admin and keeps credentials private',async()=>{
  const f=fixture({env:{GOOGLE_DRIVE_CLIENT_ID:'DRIVE-CLIENT',GOOGLE_DRIVE_CLIENT_SECRET:'PRIVATE-CLIENT-SECRET'}});
  assert.equal((await f.post({action:'drivebegin'})).ok,false);
  const status=await f.post({action:'drivestatus',adminCredential:'TEST-GOOGLE-ID'});
  assert.deepEqual(status,{ok:true,configured:true,connected:false,folderName:''});
  f.setEmail('outsider@example.invalid');assert.equal((await f.post({action:'drivestatus',adminCredential:'TEST-GOOGLE-ID'})).ok,false);
});

test('Drive OAuth consumes state once, encrypts tokens and uses PKCE',async()=>{
  let calls=0;
  const f=fixture({env:{GOOGLE_DRIVE_CLIENT_ID:'DRIVE-CLIENT',GOOGLE_DRIVE_CLIENT_SECRET:'PRIVATE-CLIENT-SECRET'},fetcher:async(url,options)=>{
    calls++;
    if(String(url).endsWith('/token')){
      assert.equal(options.body.get('grant_type'),'authorization_code');assert.ok(options.body.get('code_verifier').length>=43);
      assert.equal(options.body.get('redirect_uri'),'https://aloriginalstore.online/drive-callback.html');
      return Response.json({access_token:'ACCESS-PRIVATE',refresh_token:'REFRESH-PRIVATE',scope:'https://www.googleapis.com/auth/drive.file'});
    }
    assert.equal(JSON.parse(options.body).mimeType,'application/vnd.google-apps.folder');
    return Response.json({id:'FOLDER',name:'Imágenes nuevas'});
  }});
  const start=await f.post({action:'drivebegin',adminCredential:'TEST-GOOGLE-ID',folderName:'Imágenes nuevas'});
  assert.equal(start.ok,true);const url=new URL(start.url);assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(url.searchParams.get('scope'),'https://www.googleapis.com/auth/drive.file');assert.ok(!start.url.includes('PRIVATE-CLIENT-SECRET'));
  assert.equal((await f.post({action:'drivefinish',state:'x'.repeat(43),code:'CODE'})).ok,false);assert.equal(calls,0);
  const completed=await f.post({action:'drivefinish',state:start.state,code:'CODE'});assert.equal(completed.ok,true);
  assert.ok(!JSON.stringify(f.getState()).includes('REFRESH-PRIVATE'));assert.ok(!JSON.stringify(completed).includes('ACCESS-PRIVATE'));
  assert.equal((await f.post({action:'drivefinish',state:start.state,code:'CODE'})).ok,false);assert.equal(calls,2);
  const status=await f.post({action:'drivestatus',adminCredential:'TEST-GOOGLE-ID'});assert.equal(status.connected,true);assert.equal(status.folderName,'Imágenes nuevas');
});

test('Drive token errors distinguish configuration from expired grants without leaking upstream details',async()=>{
  for(const [reason,expected] of [['invalid_client',/credenciales del cliente/],['invalid_grant',/autorización por estar vencida/],['unknown',/Google no pudo autorizar/]]){
    const f=fixture({env:{GOOGLE_DRIVE_CLIENT_ID:'CLIENT',GOOGLE_DRIVE_CLIENT_SECRET:'SECRET'},fetcher:async()=>Response.json({error:reason,error_description:'PRIVATE-UPSTREAM-SECRET',access_token:'PRIVATE-TOKEN'},{status:400})});
    const start=await f.post({action:'drivebegin',adminCredential:'TEST-GOOGLE-ID'});
    const result=await f.post({action:'drivefinish',state:start.state,code:'CODE'});
    assert.equal(result.ok,false);assert.match(result.error,expected);assert.ok(!JSON.stringify(result).includes('PRIVATE'));
    assert.equal((await f.post({action:'drivefinish',state:start.state,code:'CODE'})).ok,false);
  }
});

test('expired or denied Drive authorization cannot exchange a code',async()=>{
  let calls=0;const f=fixture({env:{GOOGLE_DRIVE_CLIENT_ID:'CLIENT',GOOGLE_DRIVE_CLIENT_SECRET:'SECRET'},fetcher:async()=>{calls++;throw new Error('Unexpected call');}});
  const begin=()=>f.post({action:'drivebegin',adminCredential:'TEST-GOOGLE-ID'});
  const expired=await begin();f.advance(600001);assert.equal((await f.post({action:'drivefinish',state:expired.state,code:'CODE'})).ok,false);
  const denied=await begin();assert.equal((await f.post({action:'drivefinish',state:denied.state,error:'access_denied'})).ok,false);
  assert.equal((await f.post({action:'drivefinish',state:denied.state,code:'CODE'})).ok,false);assert.equal(calls,0);
});

test('Drive state revision conflict prevents external authorization',async()=>{
  let calls=0;const f=fixture({env:{GOOGLE_DRIVE_CLIENT_ID:'CLIENT',GOOGLE_DRIVE_CLIENT_SECRET:'SECRET'},fetcher:async()=>{calls++;throw new Error('Unexpected call');}});
  const begin=await f.post({action:'drivebegin',adminCredential:'TEST-GOOGLE-ID'});f.setConflict();
  assert.equal((await f.post({action:'drivefinish',state:begin.state,code:'CODE'})).ok,false);assert.equal(calls,0);
});
test('public catalogue works; private customers stay blocked',async()=>{
  const f=fixture(),catalog=await f.handler(new Request('https://test.invalid/?resource=productos')).then(r=>r.json());
  assert.equal(catalog.ok,true);assert.equal(catalog.data.length,1);
  const committed=f.commits();const privateData=await f.handler(new Request('https://test.invalid/?resource=clientes')).then(r=>r.json());assert.equal(privateData.ok,false);assert.equal(f.commits(),committed);
});
test('public full-ID lookup exposes only one summary and rejects phone lookup',async()=>{
  const f=fixture(),id='PED-20261013000100-1234';
  f.data.Pedidos.rows.push({id:'1',position:2,record:{'ID Pedido':id,Fecha:'2026-10-13',Total:1000,'Estado Pedido':'Pendiente','Nombre Cliente':'PRIVATE-CUSTOMER','Teléfono':'PRIVATE-PHONE',Direccion:'PRIVATE-ADDRESS',Email:'PRIVATE-EMAIL','Productos JSON':[{nombre:'Producto',cantidad:1,precio:1000,privateNote:'PRIVATE-NOTE'}]}});
  f.data.Facturas.rows.push({id:'1',position:2,record:{'ID Factura':'FAC-20261013000100-5678','ID Pedido':id,Total:1000,Email:'PRIVATE-EMAIL'}});
  const found=await f.post({action:'publicreference',reference:id.toLowerCase()});
  assert.equal(found.ok,true);assert.equal(found.orders.length,1);assert.equal(found.invoices.length,0);assert.equal(found.orders[0]['Productos JSON'][0].cantidad,1);assert.ok(!JSON.stringify(found).includes('PRIVATE'));
  assert.equal((await f.post({action:'publicreference',reference:'0000000000'})).ok,false);
  assert.deepEqual((await f.post({action:'publicreference',reference:'PED-20261013000100-9999'})).orders,[]);
  const invoice=await f.post({action:'publicreference',reference:'FAC-20261013000100-5678'});assert.equal(invoice.invoices.length,1);assert.equal(invoice.orders.length,0);assert.ok(!JSON.stringify(invoice).includes('PRIVATE'));
  assert.equal((await f.handler(new Request('https://test.invalid/?resource=pedidos',{headers:{Origin:'https://aloriginalstore.online'}})).then(r=>r.json())).ok,false);
});

test('Google admin identity still authorizes and denies invalid origins',async()=>{
  const f=fixture();assert.equal((await f.post({action:'adminsession',adminCredential:'TEST-GOOGLE-ID'})).ok,true);
  const response=await f.handler(new Request('https://test.invalid/',{headers:{Origin:'https://attacker.invalid'}}));assert.equal(response.status,403);
  f.setEmail('not-admin@example.invalid');assert.equal((await f.post({action:'adminsession',adminCredential:'TEST-GOOGLE-ID'})).ok,false);
});
test('temporary receipt survives a new request and is bound to its order',async()=>{
  const f=fixture();const orderBody={resource:'pedidos',action:'crear',adminCredential:'TEST-GOOGLE-ID',data:{'ID Pedido':'TEST-ORDER','Nombre Cliente':'Prueba','Teléfono':'3000000000','Productos JSON':[{idVariacion:'TEST-V1',cantidad:2}],'Tipo Cliente':'Detal'}};const order=await f.post(structuredClone(orderBody));
  assert.equal(order.ok,true,JSON.stringify(order));
  assert.equal(f.data.Pedidos.rows.length,1);assert.equal(f.data.Productos.rows[0].record.Cantidad,8);
  const grants=Object.values(f.getState().cache).map(v=>JSON.parse(v.value));assert.ok(grants.some(v=>v.id==='TEST-ORDER'));
  // The response token is the existing private receipt contract used by the client.
  const grant=order.receipt||order.comprobante||order.receiptAccess;
  assert.ok(grant,'Receipt grant should be returned');
  const read=await f.post({action:'ordertempreceipt',receiptToken:grant.token,orderId:'TEST-ORDER'});assert.equal(read.ok,true);
  assert.equal((await f.post({action:'ordertempreceipt',receiptToken:grant.token,orderId:'OTHER'})).ok,false);
  await f.post(structuredClone(orderBody));
  assert.equal(f.data.Pedidos.rows.length,1);assert.equal(f.data.Productos.rows[0].record.Cantidad,8);
  f.advance(301000);assert.equal((await f.post({action:'ordertempreceipt',receiptToken:grant.token,orderId:'TEST-ORDER'})).ok,false);
  assert.equal(f.data.Pedidos.rows.length,1);assert.equal(f.data.ComprobantesPrivados.rows.length,1);
});
test('public checkout retains server prices and preserves pending stock behavior',async()=>{
  const f=fixture();const result=await f.post({resource:'pedidos',action:'crear',data:{'Nombre Cliente':'Prueba','Teléfono':'3000000000','Productos JSON':[{idVariacion:'TEST-V1',cantidad:2,precio:1}],'Tipo Cliente':'Detal'}});
  assert.equal(result.ok,true);assert.equal(result.data.Subtotal,2000);assert.equal(f.data.Productos.rows[0].record.Cantidad,10);
  assert.equal((await f.post({action:'ordertempreceipt',receiptToken:result.receipt.token,orderId:result.receipt.orderId})).ok,true);
});
test('revision conflict never acknowledges a successful write',async()=>{
  const f=fixture();f.setConflict();const result=await f.post({resource:'productos',action:'actualizar',adminCredential:'TEST-GOOGLE-ID',id:'TEST-V1',data:{Cantidad:5}});assert.equal(result.ok,false);assert.match(result.error,/Otra operación/);assert.equal(f.data.Productos.rows[0].record.Cantidad,10);
});
test('Drive upload uses OAuth and returns the current image contract',async()=>{
  const calls=[];const env=n=>({GOOGLE_DRIVE_FOLDER_ID:'TEST-FOLDER',GOOGLE_DRIVE_CLIENT_ID:'TEST-ID',GOOGLE_DRIVE_CLIENT_SECRET:'TEST-SECRET',GOOGLE_DRIVE_REFRESH_TOKEN:'TEST-REFRESH'}[n]);
  const fetcher=async(url,options)=>{calls.push([url,options]);return Response.json(String(url).endsWith('/token')?{access_token:'TEST-ACCESS'}:String(url).includes('/upload/')?{id:'TEST-FILE'}:{});};
  const result=await uploadDrive({fileName:'test.png',mimeType:'image/png',base64Data:'AQID'},env,fetcher);assert.equal(result.id,'TEST-FILE');assert.equal(calls.length,3);assert.ok(calls[1][1].body instanceof Uint8Array);assert.equal(calls[2][1].headers.Authorization,'Bearer TEST-ACCESS');
});

test('account activation, login and logout survive independent requests',async()=>{
  const f=fixture(),password='TEST-customer-password-2026';
  const registration={action:'caregister',telefono:'3000000000',nombre:'Cliente',apellido:'Prueba',password};
  const registered=await f.post(registration);
  assert.equal(registered.ok,true,JSON.stringify(registered));
  assert.equal(f.data.CuentasPrivadas.rows.length,1);
  assert.equal(f.data.SolicitudesAccesoPrivadas.rows.length,1);
  const account=JSON.parse(f.data.CuentasPrivadas.rows[0].record.Datos);
  assert.equal(account.status,'Pendiente');
  assert.notEqual(account.hash,password);
  assert.equal((await f.post({action:'calogin',telefono:registration.telefono,password})).ok,false);
  const activationCode=registered.message.match(/Código de registro: ([A-F0-9]+)/)?.[1];
  assert.ok(activationCode);
  const request=JSON.parse(f.data.SolicitudesAccesoPrivadas.rows[0].record.Datos);
  const approved=await f.post({action:'caadminreview',adminCredential:'TEST-GOOGLE-ID',id:request.id,decision:'approve',confirmed:true,activationCode});
  assert.equal(approved.ok,true,JSON.stringify(approved));
  const login=await f.post({action:'calogin',telefono:registration.telefono,password});
  assert.equal(login.ok,true,JSON.stringify(login));
  assert.match(login.token,/^BLYXU-P5-/);
  assert.equal(JSON.parse(f.data.CuentasPrivadas.rows[0].record.Datos).sessions.length,1);
  assert.equal((await f.post({action:'calogout',token:login.token})).ok,true);
  assert.equal(JSON.parse(f.data.CuentasPrivadas.rows[0].record.Datos).sessions.length,0);
});

test('failed login throttling persists between requests',async()=>{
  const f=fixture();
  for(let i=0;i<5;i++)assert.equal((await f.post({action:'calogin',telefono:'3000000000',password:'TEST-invalid-password'})).ok,false);
  const committed=f.commits();
  const blocked=await f.post({action:'calogin',telefono:'3000000000',password:'TEST-invalid-password'});
  assert.equal(blocked.ok,false);
  assert.equal(f.commits(),committed);
  const counter=Object.entries(f.getState().cache).find(([key])=>key.startsWith('ca-limit-login-'));
  assert.equal(counter[1].value,'5');
  f.advance(900001);
  await f.post({action:'calogin',telefono:'3000000000',password:'TEST-invalid-password'});
  assert.equal(f.commits(),committed+1);
  assert.equal(f.data.CuentasPrivadas.rows.length,0);
});

test('Drive setup errors never send credentials or attempt an upload',async()=>{
  let calls=0;
  await assert.rejects(uploadDrive({mimeType:'image/png',base64Data:'AQID'},()=>undefined,async()=>{calls++;}),/almacenamiento multimedia/);
  assert.equal(calls,0);
});

test('insufficient combined stock rolls back orders, clients and inventory',async()=>{
 const f=fixture();const result=await f.post({resource:'pedidos',action:'crear',adminCredential:'TEST-GOOGLE-ID',data:{'ID Pedido':'TEST-OVERSOLD','Nombre Cliente':'Prueba','Teléfono':'3000000000','Productos JSON':[{idVariacion:'TEST-V1',cantidad:6},{idVariacion:'TEST-V1',cantidad:6}],'Tipo Cliente':'Detal'}});
 assert.equal(result.ok,false);assert.equal(f.data.Pedidos.rows.length,0);assert.equal(f.data.Clientes.rows.length,0);assert.equal(f.data.Productos.rows[0].record.Cantidad,10);
});
test('historical DET order IDs resolve exactly without private information',async()=>{
 const f=fixture(),reference='DET-20261013000100-1234';f.data.Pedidos.rows.push({id:'1',position:2,record:{'ID Pedido':reference,Total:1000,'Nombre Cliente':'PRIVATE'}});const result=await f.post({action:'publicreference',reference});assert.equal(result.orders.length,1);assert.equal(result.invoices.length,0);assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

test('new server stays disabled until its explicit activation flag is set',async()=>{
 const f=fixture({env:{ORIGINAL_STORE_API_ENABLED:undefined}});const response=await f.handler(new Request('https://test.invalid/?resource=productos'));assert.equal(response.status,503);assert.equal(f.commits(),0);
});

test('preview serves catalogue but rejects business writes without touching data',async()=>{
 const f=fixture({env:{ORIGINAL_STORE_API_ENABLED:undefined}});f.getState().properties.ORIGINAL_STORE_API_MODE='preview';const catalogue=await f.handler(new Request('https://test.invalid/?resource=productos',{headers:{Origin:'https://aloriginalstore.online'}})).then(r=>r.json());assert.equal(catalogue.ok,true);
 const attempt=await f.post({resource:'pedidos',action:'crear',data:{'Nombre Cliente':'Prueba','Productos JSON':[{idVariacion:'TEST-V1',cantidad:1}]}});assert.equal(attempt.ok,false);assert.equal(f.commits(),0);assert.equal(f.data.Pedidos.rows.length,0);assert.equal(f.data.Productos.rows[0].record.Cantidad,10);
});

test('preview supports admin transport reads without granting anonymous private access',async()=>{
 const f=fixture({env:{ORIGINAL_STORE_API_ENABLED:undefined}});f.getState().properties.ORIGINAL_STORE_API_MODE='preview';assert.equal((await f.post({resource:'productos',action:'get'})).ok,true);assert.equal((await f.post({resource:'clientes',action:'get'})).ok,false);assert.equal((await f.post({resource:'clientes',action:'get',adminCredential:'TEST-GOOGLE-ID'})).ok,true);assert.equal(f.data.Pedidos.rows.length,0);
});
