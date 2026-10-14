import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {server,start,actions} from './fixtures/shared-scan-server.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.ORIGINAL_STORE_PLAYWRIGHT_MODULE||'C:/Users/kevin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),url=await start();
try{
 const desktop=await browser.newContext(),mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const pc=await desktop.newPage(),other=await desktop.newPage(),phone=await mobile.newPage();
 const errors=[];for(const page of [pc,other,phone])page.on('pageerror',e=>errors.push(e.message));
 await Promise.all([pc.goto(url),other.goto(url),phone.goto(url)]);
 await pc.locator('[data-scan=create]').click();await pc.locator('[data-scan=pair]').waitFor({state:'visible'});
 const link=await pc.locator('[data-scan=link]').inputValue();assert.match(link,/#os-scan=/);
 // Decode the actual pairing image using the same bundled QR engine, without a camera fixture.
 const decoded=await pc.evaluate(async()=>{const blob=await fetch(document.querySelector('[data-scan=qr]').src).then(r=>r.blob()),holder=document.createElement('div');holder.id='qr-test';document.body.append(holder);const qr=new Html5Qrcode('qr-test');try{return await qr.scanFile(new File([blob],'pair.png',{type:'image/png'}),false);}finally{qr.clear();holder.remove();}});
 assert.equal(decoded,link);
 await phone.locator('[data-scan=join]').click();assert.equal(await phone.evaluate(()=>testScannerOptions.preserveRawValue),true);
 await phone.evaluate(value=>testScannerOptions.onDetected(value),link);
 await phone.locator('[data-scan=scan]').waitFor({state:'visible'});await phone.locator('[data-scan=scan]').click();assert.equal(await phone.evaluate(()=>testScannerOptions.continuous),true);
 for(const code of ['7701234567890','PRODUCTO-SEGUNDO']){
  await phone.evaluate(value=>testScannerOptions.onDetected(value),code);
  assert.equal(await pc.locator('#prod-barcode').inputValue(),code);
  assert.equal(await other.locator('#prod-barcode').inputValue(),'INICIAL');
  assert.equal(await pc.locator('#prod-nombre').inputValue(),'Producto escrito a mano');assert.equal(await pc.locator('#prod-precio').inputValue(),'12345');assert.equal(await pc.locator('#prod-stock').inputValue(),'12');assert.equal(await pc.locator('#prod-id').inputValue(),'REF-V01');
 }
 await pc.locator('#next').click();await phone.waitForFunction(()=>document.querySelector('[data-scan=destination]').textContent.includes('REF-V02'));
 await phone.evaluate(()=>testScannerOptions.onDetected('TERCER-PRODUCTO'));assert.equal(await pc.locator('#prod-barcode').inputValue(),'TERCER-PRODUCTO');
 await pc.locator('#variant').click();await pc.locator('[data-scan=target]').selectOption('var-barcode-test');
 await phone.waitForFunction(()=>document.querySelector('[data-scan=destination]').textContent.includes('variante'));
 await phone.evaluate(()=>testScannerOptions.onDetected('VARIANTE-ROJA'));assert.equal(await pc.locator('#var-barcode-test').inputValue(),'VARIANTE-ROJA');assert.equal(await pc.locator('.var-barcode-mode').isChecked(),true);
 await pc.locator('[data-scan=disconnect]').click();await phone.locator('[data-scan=scan]').waitFor({state:'hidden'});
 assert.ok(!actions.some(a=>/guardar|save|crearproducto|createproduct/.test(a)));assert.deepEqual(errors,[]);
 console.log('PASS: pairing QR decoded, two devices, consecutive readings, tab isolation, unchanged fields, next form, variant target, disconnect and zero product saves.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
