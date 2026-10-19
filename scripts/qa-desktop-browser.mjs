// Browser integration harness for the desktop renderer. Files, saves and UDP
// bridges use the real Node modules; activation uses an explicit test provider.
// This does not replace the sandboxed Electron smoke test in qa-desktop.mjs.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Profiles } from '../desktop/profiles.mjs';
import { verifyLicense } from '../desktop/license.mjs';
import { NativeGames } from '../desktop/games.mjs';
import { LevelLibrary } from '../desktop/levels.mjs';
import { LocalRelay } from '../desktop/relay.mjs';
import { fork } from 'node:child_process';
const root=path.resolve('tmp/desktop-browser-'+Date.now());await fs.mkdir(root,{recursive:true});await fs.mkdir('tmp/qa',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-features=WebRtcHideLocalIpsWithMdns']});
const clients=[];
let broker;
if(process.argv.includes('--network')) {
  broker=fork(new URL('./qa-peer-server.mjs',import.meta.url),[],{stdio:['ignore','inherit','inherit','ipc'],windowsHide:true});
  await new Promise((resolve,reject)=>{broker.once('message',resolve);broker.once('error',reject);broker.once('exit',code=>reject(Error('QA peer server exited: '+code)));});
}
process.env.SDL_VIDEODRIVER='dummy';process.env.SDL_RENDER_DRIVER='software';process.env.SDL_AUDIODRIVER='dummy';
async function client(label){
  const folder=path.join(root,label),profiles=new Profiles(folder,{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},'test-product');await profiles.init();
  const context=await browser.newContext({viewport:{width:1440,height:1080}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const send=(topic,data)=>void page.evaluate(([t,d])=>window.__qaEvents[t]?.forEach(f=>f(d)),[topic,data]).catch(()=>{});
  const levels=new LevelLibrary(folder),games=new NativeGames(path.resolve('native'),folder,e=>send('game',e),levels),relay=new LocalRelay(p=>send('packet',p));
  const api={status:()=>profiles.status(),load:()=>profiles.read(),save:s=>profiles.write(s),rename:n=>profiles.rename(n),createProfile:n=>profiles.create(n),selectProfile:id=>profiles.select(id),backup:()=>profiles.backup(),exportSave:async()=>true,
    activate:async(key,name)=>profiles.activate(await verifyLicense(key,'test-product',async()=>new Response(JSON.stringify({success:true,purchase:{product_id:'test-product'}}))),name),
    engines:()=>games.available(),levels:g=>levels.list(profiles.requireActive(),g),importLevel:g=>levels.add(profiles.requireActive(),g,path.resolve('tmp/qa-import.wad')),
    launch:o=>games.launch(o,profiles.requireActive()),stopGame:()=>games.stop(),relayOpen:o=>relay.open(o),relaySend:(id,b)=>relay.send(id,b),relayClose:id=>relay.close(id),fullscreen:async()=>false};
  await page.exposeBinding('__qaIPC',(_source,name,args)=>api[name](...args));
  await context.addInitScript(()=>{
    window.__qaEvents={game:[],packet:[]};window.ponyDesktop={};
    for(const name of ['status','load','save','rename','createProfile','selectProfile','backup','exportSave','activate','engines','levels','importLevel','launch','stopGame','relayOpen','relaySend','relayClose','fullscreen'])window.ponyDesktop[name]=(...args)=>window.__qaIPC(name,args);
    for(const [name,topic] of [['onGame','game'],['onPacket','packet']])window.ponyDesktop[name]=f=>{window.__qaEvents[topic].push(f);return()=>{};};
  });
  await page.goto(process.env.QA_URL||'http://127.0.0.1:5174/');await page.locator('#activation-form').waitFor();
  await page.screenshot({path:`tmp/qa/desktop-${label}-activation.png`});
  await page.locator('#activation-name').fill(label);await page.locator('#activation-key').fill('QA-PROVIDER-RESPONSE-ONLY');
  await page.locator('[data-action="activate"]').click();await page.locator('.starter-grid').waitFor();
  await page.locator('[data-starter="twilight-sparkle"]').click();await page.locator('[data-action="begin"]').click();await page.locator('#meadow-scene').waitFor();
  const c={context,page,profiles,games,relay,errors};clients.push(c);return c;
}
async function navigate(page,view){await page.locator(`nav [data-nav="${view}"]`).click();}
try {
  const a=await client('First Friend'),page=a.page;
  await page.locator('[data-care="feed"]').click();
  for(const view of ['adventure','ponykart','leaderboard']){await navigate(page,view);await page.screenshot({path:`tmp/qa/desktop-${view}.png`,fullPage:true});}
  await page.locator('[data-action="settings"]').click();await page.locator('#display-name').fill('Renamed Friend');await page.locator('[data-action="save-name"]').click();
  await page.reload();await page.locator('nav').waitFor();assert.equal(a.profiles.status().profile.name,'Renamed Friend');assert.equal((await a.profiles.read()).pet.ponyId,'twilight-sparkle');
  await page.locator('[data-action="settings"]').click();await page.locator('[data-action="profiles"]').click();
  await page.locator('#new-profile-name').fill('Another Friend');await page.locator('[data-action="create-profile"]').click();await page.locator('.starter-grid').waitFor();
  assert.equal(await a.profiles.read(),null);assert.equal(a.profiles.status().profiles.length,2);
  await page.locator('[data-action="profiles"]').click();await page.locator('[data-action="select-profile"]').first().click();await page.locator('nav').waitFor();
  await navigate(page,'adventure');await page.locator('#arcade-pastel').selectOption('35');
  await page.locator('[data-action="launch-arcade"][data-mode="solo"]').click();await page.locator('.arcade-live').waitFor();
  await assertEventually(async()=>{assert.ok((await a.profiles.read()).arcade.sessions.length>0);});
  await page.locator('[data-action="stop-arcade"]').click();await page.locator('.arcade-live').waitFor({state:'hidden'});
  assert.equal(await page.locator('#arcade-pastel').inputValue(),'35');
  console.log('Desktop renderer: activation, profile persistence/isolation, rename, native launch/progress/stop, pastel preference, and all screens passed.');
  if(process.argv.includes('--network')) {
    const b=await client('Second Friend');
    const code=await page.evaluate(async()=>{const {party}=await import('/src/peer-party.ts');party.peerOptions={host:'127.0.0.1',port:19001,path:'/ponyhaven',secure:false,config:{iceServers:[]}};return party.create('Renamed Friend','meadow','', 'day');});
    try { await b.page.evaluate(async(code)=>{const {party}=await import('/src/peer-party.ts');party.peerOptions={host:'127.0.0.1',port:19001,path:'/ponyhaven',secure:false,config:{iceServers:[]}};await party.join(code);},code); }
    catch(error){
      console.log('Host party diagnostics:',await page.evaluate(async()=>{const {party}=await import('/src/peer-party.ts');return {room:party.room,host:party.isHost,error:party.error,connections:[...party.connections.values()].map(c=>({open:c.open,ice:c.peerConnection?.iceConnectionState,local:c.peerConnection?.localDescription?.sdp,remote:c.peerConnection?.remoteDescription?.sdp}))};}));
      throw error;
    }
    await assertEventually(async()=>{const count=await page.evaluate(async()=>(await import('/src/peer-party.ts')).party.friends.length);assert.equal(count,1);});
    await page.evaluate(async()=>{const {party}=await import('/src/peer-party.ts');await party.background('meadow','','night');});
    await assertEventually(async()=>assert.equal(await b.page.evaluate(async()=>(await import('/src/peer-party.ts')).party.room.time),'night'));
    for(const game of ['adventure','ponykart']){
      await navigate(page,game);await page.locator('[data-action="launch-arcade"][data-mode="host"]').click();await page.locator('.arcade-live').waitFor();
      await navigate(b.page,game);await b.page.locator('[data-action="launch-arcade"][data-mode="join"]').waitFor();await b.page.locator('[data-action="launch-arcade"][data-mode="join"]').click();
      await assertEventually(async()=>{const r=a.games.running;assert.ok(r);const d=JSON.parse(await fs.readFile(r.progress,'utf8'));assert.equal(d.players,2);},30000);
      console.log(game+': two actual native engines joined over PeerJS/WebRTC + loopback UDP.');
      await b.games.stop();await a.games.stop();await page.locator('.arcade-live').waitFor({state:'hidden'});await b.page.locator('.arcade-live').waitFor({state:'hidden'});
    }
    console.log('Shared meadow invite, host background authority, friend presence, and both engine network handshakes passed.');
  }
  for(const c of clients)assert.deepEqual(c.errors,[]);
} finally {for(const c of clients){await c.games.stop();c.relay.close();}await browser.close();if(broker){const stopped=new Promise(resolve=>broker.once('exit',resolve));broker.kill();await stopped;}}
async function assertEventually(fn,timeout=18000){const until=Date.now()+timeout;let last;while(Date.now()<until){try{await fn();return;}catch(e){last=e;}await new Promise(r=>setTimeout(r,250));}throw last;}
