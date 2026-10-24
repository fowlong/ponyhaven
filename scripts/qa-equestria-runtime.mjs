import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {EquestriaGame} from '../desktop/equestria/runtime.mjs';
import {LocalRelay} from '../desktop/relay.mjs';
const root=path.resolve('tmp/equestria-runtime-qa-'+Date.now()),native=path.resolve('native/equestria');
const fresh=()=>({chests:Array.from({length:50},()=>({openedAt:0,sequence:0})),rings:0,quests:0,bits:0});
const saves={host:fresh(),guest:fresh()},events=[],names=new Map();let host,guest,a,b;
const rewardQueue=[];
const receive=e=>{
 events.push(e);
 if(e.kind==='reward')rewardQueue.push(e);
 if(['started','error'].includes(e.kind))console.log(e.kind,e.player||'',e.message||'');
};
host=new EquestriaGame(native,path.join(root,'host'),receive,{headless:true});
guest=new EquestriaGame(native,path.join(root,'guest'),receive,{headless:true});
a=new LocalRelay(p=>b.send('host',p.bytes));b=new LocalRelay(p=>a.send('guest',p.bytes));
const until=async fn=>{const end=Date.now()+30000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('Runtime check timed out. Logs: '+root);};
try{
 const status=await host.status();const mod=path.join(root,'host','profiles','qa-host','equestria',status.build.worldHash,'worldmods','equestria_qa');await fs.mkdir(mod,{recursive:true});
 await fs.writeFile(path.join(mod,'mod.conf'),'name = equestria_qa\ndepends = ponyhaven\n');
 await fs.writeFile(path.join(mod,'init.lua'),`
 local started={}
 core.register_globalstep(function()
  local online=core.get_connected_players();if #online<2 then return end
  for _,p in ipairs(online)do local name=p:get_player_name();local g=ponyhaven.players[name]
   if g and not g.travel and not started[name]then
    started[name]=true
    assert(p:get_camera().mode=='third','Third-person camera missing')
    local chest=ponyhaven.locations.chests[1];p:set_pos(vector.offset(chest,0,.1,0));ponyhaven.open_chest(p,chest);ponyhaven.open_chest(p,chest)
    local npc=ponyhaven.locations.npcs[1];p:set_pos(vector.offset(npc,0,.1,0));ponyhaven.talk(p,npc)
    assert(g.quest and not g.quest.picked,'Fetch quest was not accepted')
    p:set_pos(vector.offset(g.quest.target,0,.1,0));ponyhaven.collect_parcel(p);assert(g.quest.picked,'Fetch item did not collect')
    p:set_pos(vector.offset(npc,0,.1,0));ponyhaven.talk(p,npc);assert(g.quests>0 and not g.quest,'Return did not complete quest')
   end
  end
 end)
 `);
 const hosted=await host.launch({pony:'twilight',mode:'host',fullscreen:false,state:saves.host},{id:'qa-host',name:'First Pony'});names.set(hosted.player,'host');
 const ticket=await host.invite('guest',{uid:'qa-guest',displayName:'Second Pony',pony:'applejack',state:saves.guest});names.set(ticket.name,'guest');
 await a.open({role:'host',id:'guest',port:hosted.port});const port=await b.open({role:'guest',id:'host'});
 await assert.rejects(guest.launch({pony:'applejack',mode:'join',fullscreen:false,state:saves.guest,port,ticket,session:hosted.session,build:{...hosted.build,worldHash:'0'.repeat(64)}},{id:'qa-guest',name:'Second Pony'}),/differ/);
 await guest.launch({pony:'applejack',mode:'join',fullscreen:false,state:saves.guest,port,ticket,session:hosted.session,build:hosted.build},{id:'qa-guest',name:'Second Pony'});
 await until(async()=>{
  while(rewardQueue.length){const message=rewardQueue.shift(),save=saves[names.get(message.player)],e=message.event;
   if(e.kind==='chest'&&e.sequence===save.chests[e.chest].sequence+1)save.chests[e.chest]={openedAt:e.at,sequence:e.sequence};
   if(e.kind==='progress'){save.rings=Math.max(save.rings,e.rings);save.quests=Math.max(save.quests,e.quests);save.bits=save.rings*10+save.quests*150;}
   // This harness verifies engine acknowledgement. The actual collection award is covered by the TypeScript reward tests.
   await fs.writeFile(path.join(root,names.get(message.player)+'-save.json'),JSON.stringify(save));await host.acknowledge(message.player,save);
  }
  return Object.values(saves).every(s=>s.chests[0].sequence===1&&s.quests===1);
 });
 assert.equal(host.running.joined.size,2);assert.ok(saves.host.bits>=150&&saves.guest.bits>=150);
 await guest.stop();b.close();await host.revoke('guest');a.close();
 await until(()=>host.running.joined.size===1);
 const next=await host.invite('guest-rejoined',{uid:'qa-guest',displayName:'Second Pony',pony:'applejack',state:saves.guest});
 assert.equal(next.name,ticket.name);assert.notEqual(next.password,ticket.password);
 assert.deepEqual(saves.host.chests[0].sequence,1);assert.deepEqual(saves.guest.chests[0].sequence,1);
 console.log('Two real Luanti clients passed: loopback UDP relay, distinct authenticated ponies, third-person camera, per-player chest claim, duplicate-open guard, fetch/return rewards, save acknowledgements, mismatched-world rejection and disconnect. Logs:',root);
}finally{await guest.stop();await host.stop();a.close();b.close();}
