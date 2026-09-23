import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,cp,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {buildEMoney} from '../scripts/prepare-emoney.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),source=join(root,'ui/emoney');
const app=await readFile(join(source,'app.js'),'utf8');
const hash=b=>createHash('sha256').update(b).digest('hex');
test('production app parses and has no demo authentication',()=>{
 assert.doesNotThrow(()=>new vm.Script(app));
 for(const re of [/demoApi\s*\(/,/startPreview\s*\(/,/demo@emoney/,/Demo@12345/,/const\s+demo\s*=/,/previewAccounts/,/data-demo-advance/])assert.doesNotMatch(app,re);
 assert.match(app,/void boot\(\)/);
});
test('same-origin cookie API contract and production readiness guard retained',async()=>{
 assert.match(app,/fetch\('\/api\/digirupee' \+ path/);assert.match(app,/credentials: 'include'/);assert.ok(app.includes("test(location.protocol)"));assert.doesNotMatch(app,/SUPABASE_SECRET|ADMIN_PASSWORD|TRONGRID_API_KEY/);
 const server=await readFile(join(root,'website/server.mjs'),'utf8');
 assert.match(server,/const productionConfigurationReady =/);
 assert.match(server,/twoFactorEncryptionConfigured/);
 assert.match(server,/strict && !ready \? 503 : 200/);
 const gradle=await readFile(join(root,'android/app/build.gradle.kts'),'utf8');
 assert.match(gradle,/https:\/\/emoney-production-3e0a\.up\.railway\.app\//);
 assert.match(gradle,/versionCode = 9/);
 assert.match(gradle,/versionName = "1\.1\.1"/);
 const apkRoute=server.slice(server.indexOf("if (isDigiRupeeHost && ['/download/digirupee.apk', '/download/emoney.apk'].includes(pathname))"),server.indexOf('const legacyAdminPath'));
 const eMoneyCandidates=apkRoute.slice(apkRoute.indexOf('const candidates ='),apkRoute.indexOf('\n        : ['));
 assert.match(eMoneyCandidates,/join\(root, '\.\.', 'dist', 'eMoney\.apk'\)/);
 assert.doesNotMatch(eMoneyCandidates,/digiRupee\.apk/);
 const railway=JSON.parse(await readFile(join(root,'railway.json'),'utf8'));
 assert.equal(railway.deploy.healthcheckPath,'/ready');
 const migration=await readFile(join(root,'supabase/migrations/20260915000100_loktron_persistence.sql'),'utf8');
 for(const statement of ['create table if not exists public.loktron_state','create table if not exists public.loktron_files','enable row level security','revoke all on table public.loktron_state from anon, authenticated','revoke all on table public.loktron_files from anon, authenticated','grant all on table public.loktron_state to service_role','grant all on table public.loktron_files to service_role']) assert.match(migration,new RegExp(statement.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
});
test('deferred referral APK hook targets the stable route opening',async()=>{
 const transform=await readFile(join(root,'scripts/enable-deferred-referrals.mjs'),'utf8');
 assert.match(transform,/const downloadNeedle = "    if \(isDigiRupeeHost && \['\/download\/digirupee\.apk', '\/download\/emoney\.apk'\]\.includes\(pathname\)\) \{\\n";/);
 assert.doesNotMatch(transform,/const downloadNeedle[\s\S]*const candidates = \[/);
 assert.doesNotMatch(transform,/downloadPreludeForAlias/);
 assert.match(transform,/source = source\.replace\(downloadNeedle, downloadNeedle \+ downloadPrelude\)/);
 const server=await readFile(join(root,'website/server.mjs'),'utf8');
 const route=server.slice(server.indexOf("if (isDigiRupeeHost && ['/download/digirupee.apk', '/download/emoney.apk'].includes(pathname))"),server.indexOf('const legacyAdminPath'));
 assert.match(route,/const candidates = pathname\.endsWith\('\/emoney\.apk'\)/);
 assert.match(route,/join\(root, '\.\.', 'dist', 'eMoney\.apk'\)/);
});
test('all approved artwork bytes have matching SHA-256',async()=>{
 const hashes=JSON.parse(await readFile(join(source,'asset-sha256.json'),'utf8'));assert.equal(Object.keys(hashes).length,14);
 for(const [file,sha] of Object.entries(hashes))assert.equal(hash(await readFile(join(source,file))),sha,file);
});
test('single-file output has embedded assets and intact executable scripts',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'emoney-build-'));
 try{const result=await buildEMoney({root,destination:join(temp,'app.html')});const html=await readFile(result.target,'utf8');assert.match(html,/data:image\/webp;base64/);assert.doesNotMatch(html,/\{\{ASSET:|<!-- EMONEY_SCRIPTS -->|<script[^>]+src=/);assert.doesNotMatch(html,/<(?:img|link)[^>]+(?:src|href)=["']https?:/);for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new vm.Script(m[1]));assert.ok(html.includes("$$('[data-expires]')"));}finally{await rm(temp,{recursive:true,force:true});}
});
test('all account flows and five mobile pages have production actions',()=>{
 for(const p of ['overview','sell','orders','rewards','profile','/auth/login','/auth/register','/auth/2fa','/security/2fa/setup','/security/2fa/enable','/security/2fa/disable','/security/change-password','/security/sessions','/rewards/permanent','/wheel/spin','/quotes','/orders','/payout-methods','/support','/notifications/read-all'])assert.ok(app.includes(p),p);
});
test('order retries reuse the pending key and quote',()=>{
 assert.match(app,/state\._pendingOrder/);assert.match(app,/'Idempotency-Key':pending\.key/);assert.match(app,/quoteId:pending\.quoteId/);assert.doesNotMatch(app,/setDemoStatus|advanceDemoOrder/);
});
test('manual and permanent rewards use backend decisions',()=>{
 assert.match(app,/\/rewards\/permanent/);assert.match(app,/claimType\)\.toUpperCase\(\)==='MANUAL'/);assert.match(app,/campaigns\/\$\{encodeURIComponent\(campaignId\)\}\/claim/);
});
test('Android legacy bridge/back/referral hooks retained',()=>{
 for(const s of ['window.__digiHandleBack','DigiAndroid','consumeReferralMarker','shareText','copyText','surfaceNativeNotifications'])assert.ok(app.includes(s));
});
test('logout removes private state and modal secrets',()=>{
 assert.match(app,/referrals:null/);assert.match(app,/sessions:\[\]/);assert.match(app,/\$\('#modal'\)\.replaceChildren\(\)/);assert.match(app,/\$\('#password'\)\.value=''/);
});
test('builder changes only its generated HTML, never admin/backend/source',async()=>{
 const tmp=await mkdtemp(join(tmpdir(),'emoney-boundary-'));
 try{await mkdir(join(tmp,'ui'),{recursive:true});await cp(source,join(tmp,'ui/emoney'),{recursive:true});await mkdir(join(tmp,'website'),{recursive:true});
 const guardFiles={'website/server.mjs':'// backend stays untouched','website/server-runtime.mjs':'// runtime stays untouched','website/digirupee-admin.html':'<script>var key="digiRupee-session";</script>','website/digirupee-download.html':'<a href="/download/digirupee.apk">digiRupee</a>'};
 for(const [p,body] of Object.entries(guardFiles))await writeFile(join(tmp,p),body);
 await buildEMoney({root:tmp});for(const [p,body] of Object.entries(guardFiles))assert.equal(await readFile(join(tmp,p),'utf8'),body,p);
 }finally{await rm(tmp,{recursive:true,force:true});}
});
