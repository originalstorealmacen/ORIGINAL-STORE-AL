import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),read=file=>fs.readFileSync(new URL(file,root),'utf8');
test('all application pages load shared backend config before consumers',()=>{
 for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){const html=read(file);const consumer=html.search(/<script[^>]+src="(?:blyxu-app|blyxu-lite|admin-app|orders-page|original-store-catalog-bootstrap)\.js/);if(consumer<0)continue;const config=html.indexOf('src="backend-config.js');assert.ok(config>=0&&config<consumer,file);}
});
test('activated frontend selects the Original Store Supabase endpoint',()=>{
 const context={window:{}};vm.runInNewContext(read('backend-config.js'),context);const config=context.window.ORIGINAL_STORE_BACKEND;assert.equal(config.provider,'supabase');assert.match(config.supabase,/zhtrwvbmkxxfxvdhgngs.*original-store-api$/);assert.equal(context.window.ORIGINAL_STORE_API_URL,config.supabase);
 for(const file of ['blyxu-app.js','blyxu-lite.js','admin-app.js','orders-page.js'])assert.ok(read(file).includes('window.ORIGINAL_STORE_API_URL'),file);
});
test('product inline caches and inline scripts use valid selected endpoint',()=>{
 const html=read('producto.html');assert.equal((html.match(/window\.ORIGINAL_STORE_API_URL/g)||[]).length,3);assert.ok(!html.includes('supabase.co/macros/'));
 for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html')))for(const match of read(file).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc\s*=|\btype\s*=\s*["'](?:module|application\/(?:ld\+)?json)/i.test(match[1]))continue;assert.doesNotThrow(()=>new vm.Script(match[2]),file);}
});
test('OAuth callback clears codes and checks originating tab state',()=>{const script=read('drive-callback.js');assert.ok(script.includes("history.replaceState(null,'',location.pathname)"));assert.ok(script.includes('state!==pending'));assert.ok(script.includes("sessionStorage.removeItem('original-store-drive-state')"));assert.ok(read('drive-connect-admin.js').includes('location.assign(url.href)'));});
test('server has no dependency on another project or privileged browser key',()=>{for(const file of ['server.js','drive-connection.js','controller.js']){const source=read('supabase/functions/original-store-api/'+file);assert.ok(!/cufptttzflkdwizpqaot|blyxu\.online|blyxu\.ventas@gmail\.com|DriveApp|SpreadsheetApp|HtmlService/.test(source),file);assert.ok(!/sb_secret_[A-Za-z0-9_-]{20,}/.test(source),file);}assert.ok(!read('backend-config.js').includes('SERVICE_ROLE'));});
