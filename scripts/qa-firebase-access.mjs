// Local emulators only: invited-account access replaces the old licence gate.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {Profiles} from '../desktop/profiles.mjs';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:18080';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:19099';
initializeApp({projectId:'demo-ponyhaven'});
const admin=getFirestore(),accounts=getAuth(),uid='qa-access-'+Date.now(),password='Local-Emulator-Only-123';
await accounts.createUser({uid,email:uid+'@ponyhaven.example',password});
await admin.doc('allowedUsers/'+uid).set({enabled:true,name:'Account Friend'});
const root=await fs.mkdtemp(path.resolve('tmp/firebase-access-'));
const profiles=new Profiles(root);await profiles.init();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const api={status:()=>profiles.status(),load:()=>profiles.read(),save:s=>profiles.write(s),rename:n=>profiles.rename(n),createProfile:n=>profiles.create(n),selectProfile:id=>profiles.select(id),linkCloud:id=>profiles.linkCloud(id),backup:()=>profiles.backup(),engines:async()=>({adventure:false,ponykart:false}),levels:async()=>[],equestriaStatus:async()=>({engine:false,world:false}),stopGame:async()=>{}};
await page.exposeBinding('__qaIPC',(_,name,args)=>api[name](...args));
await page.addInitScript(()=>{
 window.ponyDesktop={};for(const name of ['status','load','save','rename','createProfile','selectProfile','linkCloud','backup','engines','levels','equestriaStatus','stopGame'])window.ponyDesktop[name]=(...args)=>window.__qaIPC(name,args);
 window.ponyDesktop.onGame=window.ponyDesktop.onPacket=window.ponyDesktop.onEquestria=()=>()=>{};
});
try{
 await page.goto('http://127.0.0.1:5175/');await page.locator('#account-form').waitFor();
 assert.equal(await page.locator('#activation-form').count(),0);
 await page.locator('#login-account').fill(uid);await page.locator('#login-password').fill(password);await page.locator('[data-action="login"]').click();
 await page.locator('.starter-grid').waitFor();assert.equal(profiles.status().profiles.length,1);assert.equal(profiles.status().profile.cloudUid,uid);
 await page.locator('[data-starter="rarity"]').click();await page.locator('[data-action="begin"]').click();await page.locator('#meadow-scene').waitFor();
 await page.reload();await page.locator('#meadow-scene').waitFor();assert.equal((await profiles.read()).pet.ponyId,'rarity');
 // Denial must apply even when a valid, populated local profile already exists.
 await admin.doc('allowedUsers/'+uid).update({enabled:false});await page.reload();
 await page.locator('[data-action="logout"]').waitFor();assert.match(await page.locator('main').innerText(),/not been invited/);assert.equal(await page.locator('#meadow-scene').count(),0);
 await admin.doc('allowedUsers/'+uid).update({enabled:true});await page.locator('[data-action="retry"]').click();await page.locator('#meadow-scene').waitFor();
 // Legacy unlinked progress remains local, but still needs an invited login.
 await profiles.linkCloud(null);await page.reload();await page.locator('#meadow-scene').waitFor();assert.equal((await profiles.read()).pet.ponyId,'rarity');assert.equal(profiles.status().profile.cloudUid,null);
 await admin.doc('allowedUsers/'+uid).delete();await page.reload();await page.locator('[data-action="logout"]').waitFor();assert.match(await page.locator('main').innerText(),/not been invited/);
 assert.equal(await fs.stat(path.join(root,'activation.bin')).then(()=>true,()=>false),false);assert.deepEqual(errors,[]);
 console.log('Firebase-only desktop login, fresh-profile linking, saved-session reload, denied accounts, legacy save preservation and no activation receipt passed. Logs: '+root);
}catch(error){console.error('Access QA failed:',error.message,await page.locator('body').innerText().catch(()=>''));throw error;}
finally{await browser.close();await accounts.deleteUser(uid);await admin.doc('allowedUsers/'+uid).delete();await admin.doc('players/'+uid).delete();await admin.terminate();}
