// Real Firebase Auth/Firestore emulators, two browsers and real desktop profile files.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { Profiles } from '../desktop/profiles.mjs';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:18080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:19099';
initializeApp({projectId:'demo-ponyhaven'});
const admin=getFirestore(),accounts=getAuth(),uid='qa-sync',password='Only-For-Local-Tests-123';
await accounts.deleteUser(uid).catch(()=>{});
await accounts.createUser({uid,email:'sync@ponyhaven.example',password,displayName:'Sync Friend'});
await admin.doc('allowedUsers/'+uid).set({enabled:true,name:'Sync Friend'});
await admin.doc('players/'+uid).delete();
const root=await fs.mkdtemp(path.resolve('tmp/sync-test-'));
const profiles=new Profiles(root,{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},'test');await profiles.init();
await profiles.activate({productId:'test',fingerprint:'a'.repeat(64)},'Sync Friend');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const errors=[];
const desktopContext=await browser.newContext({viewport:{width:1440,height:1000}});
const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const api={status:()=>profiles.status(),load:()=>profiles.read(),save:s=>profiles.write(s),rename:n=>profiles.rename(n),linkCloud:uid=>profiles.linkCloud(uid),backup:()=>profiles.backup(),engines:async()=>({adventure:false,ponykart:false}),levels:async()=>[],exportSave:async()=>true};
await desktopContext.exposeBinding('__qaIPC',(_s,name,args)=>api[name](...args));
await desktopContext.addInitScript(()=>{window.ponyDesktop={};for(const name of ['status','load','save','rename','linkCloud','backup','engines','levels','exportSave'])window.ponyDesktop[name]=(...args)=>window.__qaIPC(name,args);window.ponyDesktop.onGame=window.ponyDesktop.onPacket=()=>()=>{};});
let a=await desktopContext.newPage(),b=await mobileContext.newPage();
for(const context of [desktopContext,mobileContext])context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
a.on('pageerror',e=>errors.push(e.message));b.on('pageerror',e=>errors.push(e.message));
const url='http://127.0.0.1:5175/';
const remote=async()=>(await admin.doc('players/'+uid).get()).data();
const nav=async(p,v)=>p.locator(`nav [data-nav="${v}"]`).click();
async function pack(p,index=0){
 await nav(p,'shop');await p.locator('.pack-details [data-pack]').nth(index).click();
 await p.locator('[data-action="rip"]').click();await p.locator('[data-action="reveal-all"]').click();
 const cards=await p.locator('.reveal-summary [data-card]').evaluateAll(els=>els.map(el=>el.dataset.card));
 await p.locator('[data-action="finish-pack"]').click();await p.locator('#collection-results').waitFor();
 return cards;
}
try {
 await a.goto(url);await a.locator('[data-starter="twilight-sparkle"]').click();await a.locator('[data-action="begin"]').click();
 console.log('Sync QA: local starter ready');
 await a.locator('[data-action="settings"]').click();await a.locator('[data-action="sync-account"]').click();
 await a.locator('#sync-account').fill('sync');await a.locator('#sync-password').fill(password);await a.locator('[data-action="connect-sync"]').click();
 await until(async()=>assert.equal((await remote()).save.pet.ponyId,'twilight-sparkle'));
 console.log('Sync QA: first upload verified');
 await b.goto(url);await b.locator('#login-account').fill('sync');await b.locator('#login-password').fill(password);await b.locator('[data-action="login"]').click();await b.locator('#meadow-scene').waitFor();
 assert.equal(await b.locator('nav [data-nav]').count(),3);
 assert.equal(await b.locator('[data-wallet]').innerText(),'600');
 await nav(a,'collection');
 // Leave a series preview, then acquire cards from the other offered pack.
 await nav(b,'shop');await b.locator('[data-pool]').first().click();assert.notEqual(await b.locator('#series-filter').inputValue(),'');
 const cards=await pack(b,1);assert.ok(cards.length>=1);
 assert.equal(await b.locator('#series-filter').inputValue(),'');
 assert.ok((await b.locator('.collection-count').innerText()).includes('6 cards in your binder'));
 for(const id of new Set(cards))assert.ok(await b.locator(`#collection-results [data-card="${id}"]`).count());
 await until(async()=>assert.ok((await a.locator('.collection-count').innerText()).includes('6 cards in your binder')));
 await until(async()=>assert.equal(Object.values((await profiles.read()).collection).reduce((x,y)=>x+y,0),6));
 console.log('Linked desktop, mobile login, restricted mobile navigation, purchased cards, filter reset and live binder refresh passed.');
 await fs.mkdir('tmp/qa',{recursive:true});await b.screenshot({path:'tmp/qa/mobile-synced-binder.png',fullPage:true});
 // Phone can continue after the desktop window is closed.
 await a.close();await pack(b);await until(async()=>assert.equal(Object.values((await remote()).save.collection).reduce((x,y)=>x+y,0),11));
 a=await desktopContext.newPage();await a.goto(url);await nav(a,'collection');
 await until(async()=>assert.ok((await a.locator('.collection-count').innerText()).includes('11 cards in your binder')));
 // A disconnected device must preserve its branch rather than roll back the phone.
 await nav(a,'home');await desktopContext.setOffline(true);await a.locator('[data-action="gift"]').click();
 await nav(b,'home');await b.locator('[data-care="play"]').click();
 await until(async()=>assert.ok((await remote()).save.dirt>0));
 const cloudCoins=(await remote()).save.coins;
 await desktopContext.setOffline(false);await a.locator('#sync-notice').waitFor({timeout:25000});
 assert.equal((await remote()).save.coins,cloudCoins);
 const backup=await a.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.endsWith(':conflict-backup')))).save);
 assert.equal(backup.coins,cloudCoins+150);
 await a.locator('[data-action="reload-cloud"]').click();await a.locator('#sync-notice').waitFor({state:'detached'});
 assert.equal(await a.locator('[data-wallet]').innerText(),cloudCoins.toLocaleString());
 console.log('Desktop closed/reopened sync, offline conflict backup, and safe cloud recovery passed.');
 // Reset is a synced revision, not a deletion of authentication or invitation.
 await b.locator('[data-action="settings"]').click();await b.locator('[data-action="reset-account"]').click();await b.locator('#reset-confirm').fill('RESET');await b.locator('[data-action="confirm-reset"]').click();
 await a.locator('.starter-grid').waitFor();assert.equal((await remote()).save.coins,0);assert.equal(profiles.status().activated,true);
 await b.reload();await b.locator('.starter-grid').waitFor();
 assert.deepEqual(errors,[]);console.log('Synced reset, mobile session persistence, local activation retention, and no browser errors passed.');
} finally {await browser.close();await admin.terminate();}
async function until(fn,timeout=18000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{await fn();return;}catch(e){last=e;}await new Promise(r=>setTimeout(r,200));}throw last;}
