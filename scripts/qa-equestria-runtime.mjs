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
    assert(g.quest and g.quest.total>=2 and g.quest.current==1,'Quest chain was not accepted')
    local total=g.quest.total
    for i=1,total do
     local step=g.quest.steps[i];assert(g.quest.current==i and not step.picked,'Quest chain step out of order')
     p:set_pos(vector.offset(step.target,0,.1,0));ponyhaven.collect_parcel(p);assert(step.picked,'Fetch item did not collect')
     p:set_pos(vector.offset(npc,0,.1,0));ponyhaven.talk(p,npc);assert(g.quests==i,'Each delivered step pays one delivery')
    end
    assert(not g.quest,'Final return did not complete the chain')
    -- Close-range bevels: a crater clears its inside and bevels the new rim.
    local c=vector.round(vector.offset(npc,0,-3,0));local carved=ponyhaven.destroy_sphere(c,3);local rim=0
    for x=-4,4 do for y=-4,4 do for z=-4,4 do local q=vector.offset(c,x,y,z);local name=core.get_node(q).name;local id=core.get_content_id(name)
     if x*x+y*y+z*z<=9 then assert(name=='air' or not ponyhaven.destructible[id],'Crater kept a destructible block')
     elseif ponyhaven.bevel_base[id] then rim=rim+1 end
    end end end
    assert(not ponyhaven.bevel_enabled or carved==0 or rim>0,'Crater rim was not bevelled')
    core.log('action','PONYHAVEN_QA bevel crater carved='..carved..' rim='..rim)
   end
  end
 end)
 -- Friendship Emergency, end to end for one player, across server ticks: start,
 -- hear both ponies (E advances bubbles), find both clues, answer the choice;
 -- then start another and give it up from the journal.
 local fe={stage='start'}
 local function fields(p,form,f)for _,cb in ipairs(core.registered_on_player_receive_fields)do if cb(p,form,f)then return end end end
 core.register_globalstep(function()
  local name=fe.name or next(started);local p=name and core.get_player_by_name(name);local g=p and ponyhaven.players[name]
  if not g or g.travel or fe.stage=='done' then return end
  fe.name=name
  if fe.stage=='start' then fe.quests=g.quests;g.emergency_next=0;fe.stage='wait'
  elseif fe.stage=='wait' then if g.emergency then fe.id=g.emergency.id;fe.stage='run' end
  elseif fe.stage=='run' then
   if g.emergency then
    local target=ponyhaven.emergency_target(g);p:set_pos(vector.offset(target,0,.1,0))
    ponyhaven.friendship_interact(p);fields(p,'ponyhaven:choice',{choice_1='1'})
   else
    local xp=0;for _,v in pairs(g.harmony)do xp=xp+v end
    assert(g.fe_count==1,'Emergency did not count as resolved')
    assert(g.quests==fe.quests+2,'Emergency did not pay two deliveries')
    assert(xp>=75,'Emergency did not grant Element experience')
    fe.xp=xp;g.emergency_next=0;fe.stage='give_up'
   end
  elseif fe.stage=='give_up' then
   if g.emergency then
    fields(p,'',{give_up='1'});fields(p,'ponyhaven:give_up',{confirm='1'})
    assert(not g.emergency and g.emergency_next>(ponyhaven.seconds or 0)+60,'Giving up did not clear and reschedule')
    core.safe_file_write(core.get_worldpath()..'/emergency-qa.json',core.write_json({id=fe.id,xp=fe.xp,count=g.fe_count}))
    fe.stage='done'
   end
  end
 end)
 `);
 const hosted=await host.launch({pony:'twilight',mode:'host',fullscreen:false,state:saves.host},{id:'qa-host',name:'First Pony'});names.set(hosted.player,'host');
 const ticket=await host.invite('guest',{uid:'qa-guest',displayName:'Second Pony',pony:'applejack',state:saves.guest});names.set(ticket.name,'guest');
 await a.open({role:'host',id:'guest',port:hosted.port});const port=await b.open({role:'guest',id:'host'});
 await assert.rejects(guest.launch({pony:'applejack',mode:'join',fullscreen:false,state:saves.guest,port,ticket,session:hosted.session,build:{...hosted.build,worldHash:'0'.repeat(64)}},{id:'qa-guest',name:'Second Pony'}),/differ/);
 await guest.launch({pony:'applejack',mode:'join',fullscreen:false,state:saves.guest,port,ticket,session:hosted.session,build:hosted.build},{id:'qa-guest',name:'Second Pony'});
 let emergency=null;const emergencyFile=path.join(path.dirname(path.dirname(mod)),'emergency-qa.json');
 await until(async()=>{
  while(rewardQueue.length){const message=rewardQueue.shift(),save=saves[names.get(message.player)],e=message.event;
   if(e.kind==='chest'&&e.sequence===save.chests[e.chest].sequence+1)save.chests[e.chest]={openedAt:e.at,sequence:e.sequence};
   if(e.kind==='progress'){save.rings=Math.max(save.rings,e.rings);save.quests=Math.max(save.quests,e.quests);save.bits=save.rings*10+save.quests*150;
    for(const [k,v] of Object.entries(e.harmony||{}))(save.harmony||={})[k]=Math.max(save.harmony[k]||0,v);}
   // This harness verifies engine acknowledgement. The actual collection award is covered by the TypeScript reward tests.
   await fs.writeFile(path.join(root,names.get(message.player)+'-save.json'),JSON.stringify(save));await host.acknowledge(message.player,save);
  }
  emergency||=JSON.parse(await fs.readFile(emergencyFile,'utf8').catch(()=>'null'));
  // Element experience reaches the Ponyhaven save through the progress event.
  const synced=emergency&&Object.values(saves).some(s=>Object.values(s.harmony||{}).reduce((a,b)=>a+b,0)>=emergency.xp);
  return synced&&Object.values(saves).every(s=>s.chests[0].sequence===1&&s.quests>=2);
 });
 console.log('Friendship Emergency resolved and given up:',JSON.stringify(emergency));
 assert.equal(host.running.joined.size,2);assert.ok(saves.host.bits>=300&&saves.guest.bits>=300);
 await guest.stop();b.close();await host.revoke('guest');a.close();
 await until(()=>host.running.joined.size===1);
 const next=await host.invite('guest-rejoined',{uid:'qa-guest',displayName:'Second Pony',pony:'applejack',state:saves.guest});
 assert.equal(next.name,ticket.name);assert.notEqual(next.password,ticket.password);
 assert.deepEqual(saves.host.chests[0].sequence,1);assert.deepEqual(saves.guest.chests[0].sequence,1);
 console.log('Two real Luanti clients passed: loopback UDP relay, distinct authenticated ponies, third-person camera, per-player chest claim, duplicate-open guard, fetch/return rewards, save acknowledgements, mismatched-world rejection and disconnect. Logs:',root);
}finally{await guest.stop();await host.stop();a.close();b.close();}
