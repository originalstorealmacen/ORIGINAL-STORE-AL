import http from 'node:http';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {sharedScanAction} from '../../supabase/functions/original-store-api/shared-scan.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),cache=new Map(),subscribers=new Map();
export const actions=[];
export const server=http.createServer(async(req,res)=>{
 try{
  if(req.url==='/api'){
   let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);actions.push(body.action);
   if(body.adminCredential!=='FIXTURE-ADMIN'){res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false}));return;}
   const controller=new AbortController();res.on('close',()=>controller.abort());
   const result=await sharedScanAction({body,owner:'originalstorealmacen@gmail.com',cache:{get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)},checkpoint:async()=>{},env:k=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'FIXTURE-SECRET'})[k],headers:{},signal:controller.signal,
    fetcher:async(_url,options)=>{for(const message of JSON.parse(options.body).messages)for(const o of subscribers.get(message.topic)||[])o.onMessage(message.event,message.payload);return Response.json({});},
    subscribe:o=>{if(!subscribers.has(o.topic))subscribers.set(o.topic,new Set());subscribers.get(o.topic).add(o);setTimeout(o.onReady,5);return ()=>subscribers.get(o.topic).delete(o);}
   });
   if(result instanceof Response){res.writeHead(result.status,Object.fromEntries(result.headers));for await(const chunk of result.body)res.write(chunk);res.end();}
   else{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));}return;
  }
  const path=req.url.split('?')[0];
  if(path==='/'){
   res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin-shared-scan.css"></head><body><main style="max-width:900px;margin:25px auto"><form id="product-form"><input id="prod-id" value="REF-V01"><input id="prod-id-producto" value="REF"><input id="prod-nombre" value="Producto escrito a mano"><input id="prod-precio" value="12345"><input id="prod-stock" value="12"><input id="prod-barcode" value="INICIAL"><div id="variants"></div></form><button id="next">Otro producto</button><button id="variant">Agregar variante</button></main><script src="/qrcode-local.js"></script><script src="/html5-qrcode.min.js"></script><script>window.ORIGINAL_STORE_API_URL=location.origin+'/api';window.openExistingScanner=options=>{window.testScannerOptions=options;};</script><script src="/admin-shared-scan.js"></script><script>OriginalStoreSharedScan.initialize({getCredential:()=> 'FIXTURE-ADMIN',fetcher:fetch.bind(window),openScanner:openExistingScanner,barcodeMode:()=>{},closeScanner:()=>{}});document.getElementById('next').onclick=()=>{OriginalStoreSharedScan.invalidate();document.getElementById('prod-id').value='REF-V02';};document.getElementById('variant').onclick=()=>{document.getElementById('variants').innerHTML='<section class="admin-panel"><input class="var-barcode-mode" type="checkbox"><input class="var-barcode" id="var-barcode-test" value="AUTO"></section>';};</script></body></html>`);return;
  }
  const allowed=['/admin-shared-scan.js','/admin-shared-scan.css','/qrcode-local.js','/html5-qrcode.min.js'];if(!allowed.includes(path)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':path.endsWith('.css')?'text/css':'text/javascript'});res.end(fs.readFileSync(root+path));
 }catch(error){if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:error.message}));}
});
export async function start(){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+server.address().port;}
