// Actual world launches: destruction reset, save identities, walking and town teleports.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {EquestriaGame} from '../desktop/equestria/runtime.mjs';
const root=path.resolve('tmp/equestria-progression-qa-'+Date.now());
const game=new EquestriaGame(path.resolve('native/equestria'),root,()=>{},{headless:true});
const fresh=()=>({chests:Array.from({length:50},()=>({openedAt:0,sequence:0})),rings:0,quests:0,bits:0,books:{},bosses:{}});
const status=await game.status(),world=path.join(root,'profiles/saves/equestria',status.build.worldHash),mod=path.join(world,'worldmods/progression_qa');
await fs.mkdir(mod,{recursive:true});await fs.writeFile(path.join(mod,'mod.conf'),'name = progression_qa\ndepends = ponyhaven\n');
await fs.writeFile(path.join(mod,'init.lua'),`
local ph=ponyhaven;local phase=assert(ph.read_json(core.get_worldpath()..'/phase.json')).phase;local stage=0;local waited=0;local sounds={}
local sound=core.sound_play;core.sound_play=function(spec,params,ephemeral)sounds[spec]=(sounds[spec]or 0)+1;return sound(spec,params,ephemeral)end
local function report(value)core.safe_file_write(core.get_worldpath()..'/progression.json',core.write_json(value))end
local function scenery(p,min)
 local count=0;for _,obj in pairs(ph.horizon_tiles)do
  if obj:get_observers()[p:get_player_name()]then assert(vector.distance(obj:get_pos(),p:get_pos())<16,'Scenery anchor is outside client delivery range');count=count+1 end
 end
 return count>=min
end
core.register_globalstep(function(dt)
 local p=core.get_connected_players()[1];if not p then return end;local name=p:get_player_name();local g=ph.players[name];if not g or g.travel then return end;g.shield=(ph.seconds or 0)+100
 waited=waited+dt
 if phase==1 then
  if stage==0 then
   local npc=ph.locations.npcs[1];p:set_pos(npc);ph.talk(p,npc);assert(g.quest);g.rings=71;g.checkpoint=ph.locations.towns[1];ph.persist(name)
   local pos=vector.round(ph.locations.towns[1]);local found=false
   for y=pos.y-1,pos.y-15,-1 do pos.y=y;local node=core.get_node(pos);if ph.solid_ids[core.get_content_id(node.name)]then found=true;break end end
   assert(found,'No solid test ground');core.safe_file_write(core.get_worldpath()..'/original.json',core.write_json({pos=pos,node=core.get_node(pos)}));ph.destroy_sphere(pos,3);assert(core.get_node(pos).name=='air');stage=1;ph.travel(p,ph.locations.towns[2]);waited=0
  elseif stage==1 and waited>3 and scenery(p,16)then
   local at=p:get_pos();p:set_pos(vector.offset(at,40,0,24));stage=2;waited=0
  elseif stage==2 and waited>2 and scenery(p,16)then
   ph.travel(p,ph.locations.towns[3]);stage=3;waited=0
  elseif stage==3 and waited>3 and scenery(p,24)then
   assert(p:get_pos().z>1600,'Cloudsdale teleport failed');g.checkpoint=ph.locations.towns[1];ph.persist(name)
   local c=ph.music_composers[name];assert(c and c.notes>10 and sounds.eq_piano and sounds.eq_kick,'Procedural music did not run')
   report({pass=true,phase=phase,notes=c.notes,scenery='Canterlot, walking, Cloudsdale'});stage=4
  end
 elseif stage==0 then
  if phase==2 then
   assert(g.uid=='saves_slot-a' and g.quest and g.rings>=71 and g.books['2'],'Selected adventure progress was not restored')
  else assert(g.uid=='saves_slot-b' and not g.quest and g.rings==0 and not next(g.books),'New adventure inherited another save')end
  local original=ph.read_json(core.get_worldpath()..'/original.json');core.emerge_area(original.pos,original.pos,function(_,_,left)
   if left~=0 then return end;assert(core.get_node(original.pos).name==original.node.name,'Destruction survived reopening the world');report({pass=true,phase=phase,terrain='restored'})
  end);stage=1
 end
end)
`);
try{
 const a=fresh();a.books={'2':true};
 for(const phase of [1,2,3]){
  await fs.writeFile(path.join(world,'phase.json'),JSON.stringify({phase}));await fs.writeFile(path.join(world,'progression.json'),'{}');
  const result=await game.launch({pony:phase===3?'rarity':'luna',saveId:phase===3?'slot-b':'slot-a',mode:'solo',fullscreen:false,state:phase===3?fresh():a},{id:'saves',name:'Save QA'});
  let report;const deadline=Date.now()+70000;while(Date.now()<deadline){
   if(!game.running||game.running.failed)throw Error('Native regression failed: '+root);
   report=JSON.parse(await fs.readFile(path.join(world,'progression.json'),'utf8'));if(report.pass)break;await new Promise(r=>setTimeout(r,200));
  }
  assert.ok(report.pass,'Progression timed out: '+root);console.log('Launch',phase,report);await game.stop();assert.equal(game.running,null);
 }
 console.log('Native save isolation, terrain restoration, moving/teleport scenery and procedural audio passed. Logs:',root);
}finally{await game.stop();}
