// Actual renderer + profile files + invite-code WebRTC + two Luanti clients.
import fs from 'node:fs/promises';
import {appendFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {Profiles} from '../desktop/profiles.mjs';
import {EquestriaGame} from '../desktop/equestria/runtime.mjs';
import {LocalRelay} from '../desktop/relay.mjs';

const root=path.resolve('tmp/equestria-desktop-qa-'+Date.now()),clients=[];
// Match the launcher's 45-second connection budget: the expanded surface
// definitions must cross the real WebRTC/UDP bridge on every client join.
const until=async(fn,ms=45000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,150));}throw Error('Equestria desktop check timed out. Logs: '+root);};
let browser,server,broker;
async function client(label){
 const folder=path.join(root,label),profiles=new Profiles(folder,{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},'qa-product');await profiles.init();
 await profiles.create(label);
 const context=await browser.newContext({viewport:{width:1440,height:1080}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')console.log(label,m.text());});
 const send=(topic,data)=>void page.evaluate(([t,d])=>window.qaEvents[t]?.forEach(f=>f(d)),[topic,data]).catch(()=>{});
 const game=new EquestriaGame(path.resolve('native/equestria'),folder,e=>send('equestria',e),{headless:true});
 const process=game.process.bind(game);game.process=(r,role,args,hidden)=>{
  if(role==='client')appendFileSync(args[args.indexOf('--config')+1],`viewing_range = ${label==='Second Pony'?128:512}\n`);
  return process(r,role,args,hidden);
 };
 const relay=new LocalRelay(p=>send('packet',p));
 const api={status:()=>profiles.status(),load:()=>profiles.read(),save:s=>profiles.write(s),engines:async()=>({adventure:true,ponykart:true}),levels:async()=>[],
  equestriaStatus:()=>game.status(),equestriaLaunch:o=>game.launch(o,profiles.requireActive()),equestriaInvite:(p,i)=>game.invite(p,i),equestriaRevoke:p=>game.revoke(p),equestriaAck:(p,s)=>game.acknowledge(p,s),equestriaInput:(p,b,s)=>game.input(p,b,s),
  stopGame:()=>game.stop(),relayOpen:o=>relay.open(o),relaySend:(id,b)=>relay.send(id,b),relayClose:id=>relay.close(id)};
 await page.exposeBinding('qaIPC',(_source,name,args)=>api[name](...args));
 await context.addInitScript(names=>{
  window.qaEvents={equestria:[],game:[],packet:[]};window.ponyDesktop={};
  for(const n of names)window.ponyDesktop[n]=(...args)=>window.qaIPC(n,args);
  for(const [n,t]of [['onEquestria','equestria'],['onGame','game'],['onPacket','packet']])window.ponyDesktop[n]=f=>{window.qaEvents[t].push(f);return()=>{};};
 },Object.keys(api));
 const c={page,context,profiles,game,relay,errors,folder};clients.push(c);
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
 await page.locator('[data-starter="twilight-sparkle"]').click();await page.locator('[data-action="begin"]').click();
 await page.locator('nav [data-nav="adventure"]').click();
 assert.equal(await page.locator('[data-world="equestria"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('[data-world="trails"]').innerText(),'Bonus stages');
 await page.locator('#equestria-pony').selectOption('luna');
 await page.evaluate(async()=>{const {party}=await import('/src/peer-party.ts');party.onGame();});
 assert.equal(await page.locator('#equestria-pony').inputValue(),'luna');
 await page.locator('[data-action="launch-equestria"][data-mode="solo"]').waitFor();
 await page.locator('[data-action="equestria-new"]').click();await page.locator('#equestria-save-name').fill('Moonlight trip');await page.locator('[data-action="equestria-save-create"]').click();
 await page.locator('.adventure-current-save').filter({hasText:'Moonlight trip'}).waitFor();
 const moon=(await profiles.read()).equestriaActive;
 await page.locator('[data-action="equestria-new"]').click();await page.locator('#equestria-save-name').fill('Spare adventure');await page.locator('[data-action="equestria-save-create"]').click();
 await page.locator('.adventure-current-save').filter({hasText:'Spare adventure'}).waitFor();
 const spare=(await profiles.read()).equestriaActive;assert.notEqual(spare,moon);
 await page.locator('#equestria-pony').selectOption('applejack');await page.locator('[data-action="equestria-saves"]').click();
 assert.equal(await page.locator('.adventure-save-row').count(),0,'Saves leaked between ponies');
 await page.locator('#equestria-pony').selectOption('luna');await page.locator('[data-action="equestria-saves"]').click();
 assert.equal(await page.locator('.adventure-save-row').count(),2);
 await page.locator(`[data-action="equestria-save-delete"][data-save="${spare}"]`).click();
 assert.equal((await profiles.read()).equestriaSaves.filter(s=>s.pony==='luna').length,2,'Delete confirmation was skipped');
 await page.locator(`[data-action="equestria-save-delete-confirm"][data-save="${spare}"]`).click();
 await page.locator(`[data-action="equestria-save-load"][data-save="${moon}"]`).click();await page.locator('.adventure-current-save').filter({hasText:'Moonlight trip'}).waitFor();
 assert.equal((await profiles.read()).equestriaActive,moon);assert.equal((await profiles.read()).equestriaSaves.length,2,'Original legacy adventure was lost');
 await page.evaluate(async()=>{const {party}=await import('/src/peer-party.ts');party.peerOptions={host:'127.0.0.1',port:19001,path:'/ponyhaven',secure:false,config:{iceServers:[]}};});
 return c;
}
try{
 await fs.mkdir('tmp/qa',{recursive:true});
 server=await createServer({configFile:false,envFile:false,server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});await server.listen();
 broker=fork(new URL('./qa-peer-server.mjs',import.meta.url),[],{stdio:['ignore','inherit','inherit','ipc'],windowsHide:true});
 await new Promise((resolve,reject)=>{broker.once('message',resolve);broker.once('error',reject);broker.once('exit',c=>reject(Error('QA peer server exited: '+c)));});
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-features=WebRtcHideLocalIpsWithMdns']});
 const host=await client('First Pony'),guest=await client('Second Pony');console.log('Pony-specific create, delete confirmation, load and legacy preservation passed on both profiles.');
 await host.page.screenshot({path:'tmp/qa/equestria-desktop.png',fullPage:true});
 await host.page.setViewportSize({width:390,height:844});await host.page.screenshot({path:'tmp/qa/equestria-mobile.png',fullPage:true});
 assert.ok(await host.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await host.page.setViewportSize({width:1440,height:1080});
 // Add a QA-only world mod, outside the shipped game, to trigger real interactions.
 const status=await host.game.status(),profile=host.profiles.requireActive();
 const mod=path.join(host.folder,'profiles',profile.id,'equestria',status.build.worldHash,'worldmods','equestria_qa');await fs.mkdir(mod,{recursive:true});
 await fs.writeFile(path.join(mod,'mod.conf'),'name = equestria_qa\ndepends = ponyhaven\n');
 await fs.writeFile(path.join(mod,'init.lua'),`
 local done={};local checked=false;local scenery_checked=false
 core.register_globalstep(function()
  local online=core.get_connected_players();if #online<2 then return end
  if not scenery_checked then
   local a=ponyhaven.horizon_clients[online[1]:get_player_name()];local b=ponyhaven.horizon_clients[online[2]:get_player_name()];local common=0
   if a and b then for id in pairs(a.ready)do if b.ready[id]then common=common+1 end end end
   if common>=8 then
    for _,obj in pairs(ponyhaven.horizon_tiles)do for observer in pairs(obj:get_observers())do assert(ponyhaven.horizon_clients[observer].ready[obj:get_luaentity().tile_id],'Scenery sent before its mesh was ready')end end
    local ranges={};for _,p in ipairs(online)do local s=ponyhaven.horizon_selection[p:get_player_name()];if s then ranges[s.range]=true end end
    if ranges[128]and ranges[512]then local f=assert(io.open(core.get_worldpath()..'/scenery-qa.txt','w'));f:write('PASS');f:close();scenery_checked=true end
   end
  end
  for _,p in ipairs(online)do local name=p:get_player_name();local g=ponyhaven.players[name]
   if g and not g.travel and not done[name]then
    done[name]=true;assert(p:get_camera().mode=='third');assert(g.pony=='luna','Selected pony was not applied')
    g.pending['book:1']={kind='book',book=1};ponyhaven.sync(name)
    local chest=ponyhaven.locations.chests[1];p:set_pos(vector.offset(chest,0,.1,0));ponyhaven.open_chest(p,chest);ponyhaven.open_chest(p,chest)
    local npc=ponyhaven.locations.npcs[1];p:set_pos(vector.offset(npc,0,.1,0));ponyhaven.talk(p,npc)
    assert(g.quest and g.quest.steps and g.quest.total>=2)
    for qi=1,g.quest.total do local step=g.quest.steps[g.quest.current];p:set_pos(vector.offset(step.target,0,.1,0));ponyhaven.collect_parcel(p);p:set_pos(vector.offset(npc,0,.1,0));ponyhaven.talk(p,npc)end
    assert(g.quests==1)
   end
  end
  if not checked and done[online[1]:get_player_name()] and done[online[2]:get_player_name()]then
   local owner,viewer=online[1],online[2];local a,b=owner:get_player_name(),viewer:get_player_name()
   local views=ponyhaven.avatar_views[a];if not views or not views[b]then return end
   owner:set_pos({x=0,y=40,z=0});viewer:set_pos({x=0,y=40,z=20});owner:set_look_horizontal(0);viewer:set_look_horizontal(0);ponyhaven.players[a].facing=0
   ponyhaven.update_avatar(views[a]:get_luaentity());ponyhaven.update_avatar(views[b]:get_luaentity())
   assert(views[a]:get_properties().initial_sprite_basepos.x==4,'Owner must see pony back')
   assert(views[b]:get_properties().initial_sprite_basepos.x==0,'Peer in front must see pony front')
   assert(views[a]:get_attach()==owner and views[b]:get_attach()==owner)
   assert(views[a]:get_observers()[a] and not views[a]:get_observers()[b]);assert(views[b]:get_observers()[b] and not views[b]:get_observers()[a])
   local f=assert(io.open(core.get_worldpath()..'/avatar-qa.txt','w'));f:write('PASS');f:close();checked=true
  end
 end)
 `);
 const before=await Promise.all(clients.map(c=>c.profiles.read()));
 const code=await host.page.evaluate(async()=>(await import('/src/peer-party.ts')).party.create('First Pony','meadow','','day'));
 await guest.page.evaluate(async code=>(await import('/src/peer-party.ts')).party.join(code),code);
 await host.page.locator('[data-action="launch-equestria"][data-mode="host"]').click();
 await until(()=>host.game.running?.joined.size===1);
 await guest.page.locator('[data-action="launch-equestria"][data-mode="join"]').click();
 await until(()=>host.game.running?.joined.size===2);
 await until(async()=>{const saves=await Promise.all(clients.map(c=>c.profiles.read()));return saves.every(s=>s.equestria.chests[0].sequence===1&&s.equestria.quests===1&&s.equestria.books?.['1']);});
 for(let i=0;i<clients.length;i++){
  const s=await clients[i].profiles.read(),b=before[i];
  const items=x=>Object.values(x.collection).reduce((a,b)=>a+b,0)+x.petUnlocks.length;
  assert.equal(items(s)-items(b),1,'One chest must award exactly one collection item.');assert.ok(s.equestria.bits>=150);
  assert.deepEqual(s.equestriaSaves.find(slot=>slot.id===s.equestriaActive).progress,s.equestria,'Rewards were not saved in the selected slot');
 }
 console.log('Invite code joined two real Luanti clients; both profile files contain one chest item and a quest reward.');
 await until(async()=>await fs.readFile(path.join(mod,'../../avatar-qa.txt'),'utf8').catch(()=> '')==='PASS');
 console.log('Both players have attached avatars with separate camera-relative front/back frames and exclusive observers.');
 await until(async()=>await fs.readFile(path.join(mod,'../../scenery-qa.txt'),'utf8').catch(()=> '')==='PASS');
 assert.deepEqual(Object.values(host.game.running.viewRanges).sort((a,b)=>a-b),[128,512]);
 console.log('Both peers loaded shared scenery; each uses its own live draw distance (128 and 512).');
 await guest.page.locator('[data-action="stop-arcade"]').click();await until(()=>!guest.game.running);await until(()=>host.game.running?.joined.size===1);
 await guest.page.locator('[data-action="launch-equestria"][data-mode="join"]').click();await until(()=>host.game.running?.joined.size===2);
 await host.page.locator('[data-action="stop-arcade"]').click();await until(()=>!host.game.running&&!guest.game.running);
 for(const c of clients){assert.deepEqual(c.errors,[]);assert.equal((await c.profiles.read()).equestria.chests[0].sequence,1);}
 await guest.page.reload();await guest.page.locator('nav').waitFor();
 assert.equal((await guest.profiles.read()).equestria.quests,1);
 console.log('Equestria desktop passed: responsive UI, real invite-code host/join, separate persisted rewards, reconnect, host shutdown, reload. Logs:',root);
}finally{
 for(const c of clients){await c.game.stop();c.relay.close();}
 if(browser)await browser.close();
 if(broker&&broker.exitCode===null){const ended=new Promise(r=>broker.once('exit',r));broker.kill();await ended;}
 if(server)await server.close();
}
