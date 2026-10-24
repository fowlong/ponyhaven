// Real Luanti server/client; the QA mod is created only in a disposable profile.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {EquestriaGame} from '../desktop/equestria/runtime.mjs';
const root=path.resolve('tmp/equestria-combat-qa-'+Date.now()),native=path.resolve('native/equestria');
const state={chests:Array.from({length:50},()=>({openedAt:0,sequence:0})),rings:0,quests:0,bits:0,books:{},bosses:{}};
const events=[];const game=new EquestriaGame(native,root,e=>events.push(e),{headless:true});
const status=await game.status(),world=path.join(root,'profiles','combat','equestria',status.build.worldHash),mod=path.join(world,'worldmods','combat_qa');
await fs.mkdir(mod,{recursive:true});await fs.writeFile(path.join(mod,'mod.conf'),'name = combat_qa\ndepends = ponyhaven\n');
await fs.writeFile(path.join(mod,'init.lua'),`
local ph=ponyhaven;local stage=0;local time=0;local arena;local boss;local next_spell=1;local sequence=0
local function report(text)local f=assert(io.open(core.get_worldpath()..'/combat-report.txt','a'));f:write(text..'\\n');f:close()end
local function fill(center,r,name)for z=-r,r do for y=-r,r do for x=-r,r do core.set_node(vector.offset(center,x,y,z),{name=name})end end end end
local function original(pos)local n=core.get_node(pos);return core.get_name_from_content_id(ph.original_content(core.get_content_id(n.name),n.param2))end
local function remesh(center,r)
 local lo,hi=vector.offset(center,-r,-r,-r),vector.offset(center,r,r,r)
 local vm=VoxelManip();local a,b=vm:read_from_map(vector.offset(lo,-1,-1,-1),vector.offset(hi,1,1,1));local area=VoxelArea:new({MinEdge=a,MaxEdge=b})
 local data,param2=vm:get_data(),vm:get_param2_data();ph.smooth_volume(data,area,lo,hi,param2);vm:set_data(data);vm:set_param2_data(param2);vm:write_to_map(true);vm:close()
end
core.register_globalstep(function(dt)
 time=time+dt;local p=core.get_connected_players()[1];if not p then return end;local name=p:get_player_name();local g=ph.players[name];if not g or g.travel then return end
 g.shield=(ph.seconds or 0)+60
 if stage==0 then
  assert(g.pony=='twilight');local avatar=ph.avatars[name];if not avatar or not avatar:get_pos()then return end
  assert(ph.horizon_object and ph.horizon_object:get_pos(),'Distant terrain entity is missing')
  local horizon=ph.horizon_object:get_properties();assert(not horizon.is_visible and not horizon.physical and not horizon.pointable)
  if not next(ph.horizon_tiles)then return end
  local count=0;for _,obj in pairs(ph.horizon_tiles)do count=count+1;assert(not obj:get_properties().physical and not obj:get_properties().pointable);assert(obj:get_observers()[name])end
  if count<5 then return end
  local selection=ph.horizon_selection[name];assert(selection.range==512,'Live client viewing range was not observed');assert(selection.triangles<1600000,'Scenery triangle budget regressed')
  assert(count<400,'Nearby 3D scenery was not bounded to local tiles: '..count)
  local _,camera=p:get_eye_offset();assert(camera.z==-5,'Third-person camera was not moved back by half a node')
  local remote=core.get_node_or_nil({x=6500,y=100,z=4000});assert(not remote or remote.name=='ignore','Horizon loaded distant voxel blocks')
  ph.update_book_hud(p);for _,slot in ipairs(ph.map_huds[name].books)do assert(slot.state=='locked')end;assert(#ph.map_huds[name].books==7)
  assert(p:get_inventory():get_size('main')==8,'Hidden controller book wheel is missing')
  local books=g.books;g.books={['2']=true,['6']=true};g.equipped=nil
  ph.cycle_book(p,g,1);assert(g.equipped==2);ph.cycle_book(p,g,1);assert(g.equipped==6)
  ph.cycle_book(p,g,1);assert(g.equipped==nil);ph.cycle_book(p,g,-1);assert(g.equipped==6)
  g.books=books;g.equipped=nil;ph.update_book_hud(p)
  assert(avatar:get_attach()==p,'Avatar must follow client-predicted player movement through attachment')
  for _,id in ipairs({'twilight','applejack','fluttershy','rarity','derpy','luna','trixie','pinkiepie','rainbowdash'})do
   g.pony=id;g.motion=nil;ph.set_motion(name,'idle');assert(avatar:get_properties().textures[1]=='eq_pony_'..id..'_idle.png')
   g.motion=nil;ph.set_motion(name,'swim');assert(avatar:get_properties().textures[1]=='eq_pony_'..id..'_swim.png')
  end
  g.pony='twilight';g.facing=0;p:set_look_horizontal(math.pi);stage=1;time=0
 elseif stage==1 and time>.3 then
  local avatar=ph.avatars[name]
  for i,column in ipairs({4,5,6,7,0,1,2,3})do p:set_look_horizontal((i-1)*math.pi/4);ph.update_avatar(avatar:get_luaentity());assert(avatar:get_properties().initial_sprite_basepos.x==column,'Camera orbit did not change the actual sprite column');assert(g.facing==0)end
  assert(avatar:get_observers()[name]);assert(avatar:get_attach()==p)
  assert(p:get_properties().zoom_fov==72,'Interact key disables zoom')
  ph.update_map_huds();assert(p:hud_get(ph.map_huds[name].health).text=='eq_health_20.png','Player health bar missing')
  local water;for _,m in ipairs(ph.materials)do if m.base=='water' then water=m.name;break end end
  local body=vector.round(vector.offset(p:get_pos(),0,.7,0));local previous=core.get_node(body);core.set_node(body,{name=assert(water)});ph.movement(p,g,.05);assert(g.motion=='swim');core.set_node(body,previous)
  ph.map_form(p);core.close_formspec(name,'ponyhaven:travel');g.map_open=false
  local start=p:get_pos();local npc=ph.locations.npcs[1];p:set_pos(npc);ph.talk(p,npc);assert(g.quest and g.quest.steps and g.quest.total>=2,'Quest chain was not generated')
  ph.update_map_huds();local h=ph.map_huds[name];assert(h.markers['npc:'..npc.id]);assert(h.markers.quest.label)
  assert(p:hud_get(h.quest).text:find('Find ',1,true),'Persistent find objective is missing')
  -- Complete all quest steps
  local total_steps=g.quest.total
  for step_i=1,total_steps do
   local step=g.quest.steps[g.quest.current];p:set_pos(step.target);ph.collect_parcel(p)
   ph.update_map_huds();assert(p:hud_get(h.quest).text:find('Return ',1,true));assert(p:hud_get(h.markers.quest.label).name=='Return delivery')
   p:set_pos(npc);ph.talk(p,npc);ph.update_map_huds()
   if step_i<total_steps then assert(g.quest,'Quest chain ended early at step '..step_i) end
  end
  assert(not g.quest and not h.markers.quest,'Quest chain did not complete');p:set_pos(start)
  report('Seven visible pony textures, eight real sprite columns during orbit, swimming, persistent quest HUD, overhead markers, fetch/return tracking and world map passed.')
  arena=vector.round(vector.offset(p:get_pos(),50,35,50));stage=2
  core.emerge_area(vector.offset(arena,-20,-15,-20),vector.offset(arena,20,15,20),function(_,_,remaining)if remaining==0 then stage=3 end end)
 elseif stage==3 then
  local brick,stone;for _,m in ipairs(ph.materials)do if m.base=='bricks'then brick=m.name elseif m.base=='stone'then stone=m.name end end
  fill(arena,7,'air')
  local start=p:get_pos();p:set_pos(vector.offset(arena,0,4,0))
  for _,id in ipairs({'fluttershy','derpy','luna'})do
   g.pony=id;g.flying=true
   for i=1,120 do ph.movement(p,g,1);assert(g.flying and g.motion=='fly','Flight expired for '..id);assert(math.abs(p:get_physics_override().gravity-.2)<.001)end
  end
  local water;for _,m in ipairs(ph.materials)do if m.base=='water'then water=m.name;break end end
  local body=vector.round(vector.offset(p:get_pos(),0,.7,0));core.set_node(body,{name=water});ph.movement(p,g,.05);assert(not g.flying and g.motion=='swim');core.set_node(body,{name='air'})
  g.pony='twilight';p:set_pos(start)
  report('Fluttershy, Derpy and Luna retain flying motion and lift beyond two simulated minutes each; entering water returns to swimming.')
  assert(not core.settings:get_bool('ponyhaven_smooth',false),'NoCube should be disabled')
  assert(not next(ph.surface_masks),'Disabled NoCube registered surface variants')
  report('NoCube disabled; original map materials and solid cube geometry retained.')
  local enemy=core.add_entity(vector.offset(arena,0,1,9),'ponyhaven:changeling');local e=enemy:get_luaentity();e.key='qa-enemy';e.hp=45
  enemy:set_properties({textures={'eq_changeling_front.png'},spritediv={x=1,y=7}});ph.health_bar(e,1.1,1.8);assert(e.healthbar:get_attach()==enemy)
  ph.attack_warning(e,.85);assert(e.warn_until>(ph.seconds or 0));ph.step_warning(e);e:hurt(10,p);assert(e.healthbar:get_properties().textures[1]=='eq_health_16.png')
  local orb=ph.shoot(nil,vector.offset(arena,0,1,5),{x=0,y=0,z=-1},{enemy=true,dark=true,speed=14,radius=2,damage=18,colour='#7b549d'});assert(orb:get_properties().textures[1]=='eq_dark_orb.png');orb:remove();enemy:remove()
  fill(arena,7,assert(brick));local count=ph.destroy_sphere(arena,3);assert(count==123,'Three-block sphere must remove exactly 123 brick voxels, got '..count)
  assert(original(arena)=='air');assert(original(vector.offset(arena,3,0,0))=='air');assert(original(vector.offset(arena,4,0,0))==brick)
  assert(core.get_node(vector.offset(arena,4,0,0)).name==brick,'Destruction introduced smoothing')
  for _,o in ipairs(core.get_objects_inside_radius(arena,12))do local e=o:get_luaentity();assert(not e or e.name~='__builtin:item','Explosion dropped a collectible block')end
  report('Spherical three-voxel destruction, original building crater and no collectible block drops passed.')
  fill(arena,7,'air');fill(arena,4,brick);ph.shoot(name,vector.offset(arena,0,0,-10),{x=0,y=0,z=1},{speed=18,radius=3,damage=35,dig=3});stage=4;time=0
 elseif stage==4 and time>1.1 then
  assert(original(vector.offset(arena,0,0,-4))=='air','Projectile did not impact the building');assert(original(arena)~='air','Orb destroyed beyond its three-block radius');report('Medium-speed projectile ray impact passed.')
  local book=ph.encounters.books[1];p:set_pos(book);stage=41;time=0
 elseif stage==41 and time>1.2 then
  local book=assert(ph.book_objects[1],'Unique spellbook did not appear');assert(book:get_observers()[name]);local count=0
  for _,o in ipairs(core.get_objects_inside_radius(p:get_pos(),8))do local e=o:get_luaentity();if e and e.name=='ponyhaven:spellbook'then count=count+1 end end;assert(count==1,'Duplicate spellbook entities')
  ph.interact_extra(p);stage=5;time=0
 elseif stage==5 and g.books['1']and time>1.2 then
  local book=ph.book_objects[1];assert(not book or not book:get_observers()[name],'Collected book is still visible to its collector')
  report('Bounded non-colliding 3D scenery leaves remote voxels unloaded; camera is half a node further back; each spellbook spawns once and hides after collection.')
  ph.update_book_hud(p);local slots=ph.map_huds[name].books;assert(slots[1].state=='owned');assert(slots[2].state=='locked')
  ph.book_input({player=name,book=2,sequence=1});assert(g.equipped==nil and slots[2].state=='locked','Locked book became equipped')
  ph.book_input({player=name,book=1,sequence=2});assert(g.equipped==1 and slots[1].state=='equipped');ph.book_input({player=name,book=1,sequence=2});assert(g.equipped==1)
  g.books['3']=true;g.books['5']=true;ph.book_input({player=name,book=3,sequence=3});assert(g.equipped==3 and slots[1].state=='owned' and slots[3].state=='equipped')
  local hud={};for _,slot in ipairs(slots)do for _,id in pairs(slot.ids)do hud[#hud+1]=p:hud_get(id)end end
  local f=assert(io.open(core.get_worldpath()..'/bookbar-hud.json','w'));f:write(core.write_json(hud));f:close()
  ph.book_input({player=name,book=3,sequence=4});assert(g.equipped==nil and slots[3].state=='owned','Repeated key should put the book away')
  for i=1,7 do g.books[tostring(i)]=true end;ph.update_book_hud(p);for _,slot in ipairs(slots)do assert(slot.state=='owned')end
  report('Seven-slot spellbook HUD reflects locked, collected, equipped, switched and put-away books; replay-safe inputs passed.');stage=6;time=0
 elseif stage==6 and time>.15 then
  time=0;g.equipped=math.ceil(next_spell/2);g.mana=100;g.hp=50;ph.cast(p,g,next_spell%2==0);assert(g.mana<100)
  next_spell=next_spell+1
  if next_spell>14 then
   g.equipped=nil;g.combo=nil;for i=1,3 do ph.slash(p,g);assert(g.combo==i)end
   local trails=0;for _,o in ipairs(core.get_objects_inside_radius(p:get_pos(),6))do local e=o:get_luaentity();if e and e.name=='ponyhaven:melee_trail'then
    assert(o:get_attach()==p);assert(o:get_properties().visual=='mesh');assert(math.abs(o:get_properties().automatic_rotate)>1);trails=trails+1
   end end;assert(trails>=3,'Melee must use three attached horizontal trail meshes')
   report('All fourteen spell casts and the three-hit horizontal melee trail combo passed.')
   boss=ph.encounters.bosses[1];ph.travel(p,boss);stage=7;time=0
  end
 elseif stage==7 then
  local obj=ph.boss_objects[boss.id];if not obj or not obj:get_pos()then return end
  local e=obj:get_luaentity();local s=ph.npc_sheets[boss.id];assert(math.abs(obj:get_properties().visual_size.y-math.min(2.3,s.height/60)*10)<.01)
  assert(e.healthbar and e.healthbar:get_attach()==obj,'Boss health bar missing')
  for _,move in ipairs({'volley','nova','meteors','spiral','crossfire'})do e.boss.moves={move};e.turn=0;ph.boss_cast(e,p)end
  assert(e.warn_until>(ph.seconds or 0),'Boss attack has no warning');stage=8;time=0
 elseif stage==8 and time>3 then
  local obj=assert(ph.boss_objects[boss.id]);obj:get_luaentity():hurt(2000,p);assert(not ph.boss_objects[boss.id]);p:set_pos(boss);assert(ph.interact_extra(p));stage=9
 elseif stage==9 and g.bosses[boss.id]then report('Giant boss scale, five attack patterns, defeat and pet reward acknowledgement passed.');report('PASS');stage=10 end
end)
`);
try{
 const started=await game.launch({pony:'twilight',mode:'solo',fullscreen:false,state},{id:'combat',name:'Combat QA'});
 const deadline=Date.now()+60000;let report='';
 while(Date.now()<deadline){
  for(const e of events.splice(0)){
   if(e.kind==='error')throw Error(e.message);
   if(e.kind==='reward'){
    if(e.event.kind==='book')state.books[e.event.book]=true;
    if(e.event.kind==='boss')state.bosses[e.event.boss]=true;
    if(e.event.kind==='progress'){state.rings=Math.max(state.rings,e.event.rings);state.quests=Math.max(state.quests,e.event.quests);state.bits=state.rings*10+state.quests*150;}
    await game.acknowledge(e.player,state);
   }
  }
  report=await fs.readFile(path.join(world,'combat-report.txt'),'utf8').catch(()=> '');
  if(report.includes('PASS'))break;await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(report.includes('PASS'),report+'\nLogs: '+root);assert.ok(state.books['1']);assert.equal(Object.keys(state.bosses).length,1);
 console.log(report.trim()+'\nLogs: '+root);
}catch(error){console.error((await fs.readFile(path.join(root,'profiles/combat/equestria/server.log'),'utf8').catch(()=> '')).split(/\r?\n/).filter(l=>l.includes('ERROR')).slice(-12).join('\n'));throw error;}finally{await game.stop();}
