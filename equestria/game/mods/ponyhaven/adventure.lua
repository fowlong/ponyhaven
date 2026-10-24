local ph=ponyhaven
local locations=assert(ph.read_json(ph.world..'/imported/locations.json'),'Missing Equestria adventure locations')
local pony_sheets=assert(ph.read_json(ph.path..'/ponies.json'))
local npc_sheets={};for _,npc in ipairs(assert(ph.read_json(ph.path..'/npcs.json')))do npc_sheets[npc.id]=npc end
local storage=core.get_mod_storage()
local players,registry,avatars,npc_objects={}, {}, {}, {}
ph.players=players;ph.locations=locations;ph.avatars=avatars;ph.npc_sheets=npc_sheets
local revision=-1;local tick=0;local seconds=0;local enemies={};local enemy_respawn={}
local function now()return os.time()*1000 end
local function copy(t)return core.parse_json(core.write_json(t)) or {} end
local function hash(s)local h=17;for i=1,#s do h=(h*131+s:byte(i))%2147483647 end;return h end
local function distance(a,b)return vector.distance(a,b)end
local function position(p,dy)return {x=p.x,y=p.y+(dy or 0),z=p.z}end
local function persist(name)
 local g=players[name];if not g then return end
 storage:set_string('p:'..g.uid,core.write_json({rings=g.rings,quests=g.quests,chests=g.chests,pending=g.pending,quest=g.quest,ring_day=g.ring_day,marks=g.marks,checkpoint=g.checkpoint,books=g.books,bosses=g.bosses}))
end
local function notice(name,text)core.chat_send_player(name,text);local g=players[name];if g then g.notice=text;g.notice_until=seconds+4 end end
local function reward(name,event)ph.emit({kind='reward',player=name,event=event})end
local function sync(name)
 local g=players[name];if not g then return end
 if g.rings>g.acked_rings or g.quests>g.acked_quests then reward(name,{kind='progress',rings=g.rings,quests=g.quests})end
 for _,pending in pairs(g.pending)do reward(name,pending)end
end
local function valid_state(s)
 if type(s)~='table' or type(s.chests)~='table' or #s.chests~=50 or type(s.rings)~='number' or type(s.quests)~='number' then return false end
 for _,c in ipairs(s.chests)do if type(c)~='table' or type(c.sequence)~='number' or type(c.openedAt)~='number' then return false end end
 return true
end
ph.persist=persist;ph.notice=notice;ph.reward=reward;ph.sync=sync;ph.hash=hash
local function load_player(name,entry)
 local stored=storage:get_string('p:'..entry.uid);local old=stored~='' and core.parse_json(stored) or {};local state=entry.state
 local g={uid=entry.uid,pony=entry.pony,display=entry.displayName,rings=math.max(old.rings or 0,state.rings),quests=math.max(old.quests or 0,state.quests),
  acked_rings=state.rings,acked_quests=state.quests,chests=copy(state.chests),pending=old.pending or {},quest=old.quest,ring_day=old.ring_day or '',marks=old.marks or {},checkpoint=old.checkpoint,
  books=copy(state.books or {}),bosses=copy(state.bosses or {}),bag=0,air_used=false,flying=false,roll=0,charge=0,previous={},objects={},notice='',notice_until=0,hp=100,mana=100,facing=0}
 -- Saves from before quest chains hold one {item,target,picked} delivery.
 local q=g.quest
 if type(q)=='table' and type(q.steps)~='table' then
  g.quest=q.item and q.target and type(q.npc)=='number' and {npc=q.npc,theme='friendship',steps={{item=q.item,target=q.target,picked=q.picked==true}},current=1,total=1} or nil
 end
 if old.chests then for i,c in ipairs(old.chests)do if g.chests[i] and c.sequence>g.chests[i].sequence then g.chests[i]=c end end end
 for key,event in pairs(g.pending)do
  if event.kind=='chest' and state.chests[event.chest+1].sequence>=event.sequence then g.pending[key]=nil end
  if event.kind=='book' and g.books[tostring(event.book)] then g.pending[key]=nil end
  if event.kind=='boss' and g.bosses[event.boss] then g.pending[key]=nil end
 end
 players[name]=g;return g
end
local function acknowledge(name,state)
 local g=players[name];if not g or not valid_state(state) then return end
 g.acked_rings=math.max(g.acked_rings,state.rings);g.acked_quests=math.max(g.acked_quests,state.quests)
 for k,v in pairs(state.books or {})do if v then
  g.books[k]=true;g.pending['book:'..k]=nil
  local obj=ph.book_objects and ph.book_objects[tonumber(k)]
  if obj and obj:get_pos()then local observers=obj:get_observers();observers[name]=nil;obj:set_observers(observers)end
 end end
 for k,v in pairs(state.bosses or {})do if v then g.bosses[k]=true;g.pending['boss:'..k]=nil end end
 for i,c in ipairs(state.chests)do
  if c.sequence>=g.chests[i].sequence then g.chests[i]=copy(c)end
  local pending=g.pending[tostring(i)]
  if pending and c.sequence>=pending.sequence then g.pending[tostring(i)]=nil;notice(name,'Treasure '..i..' saved to your Ponyhaven collection!')end
 end
 persist(name)
end
local function bridge()
 local input=ph.read_json(ph.world..'/bridge.json')
 if not input or input.session~=core.settings:get('ponyhaven_session') or input.revision==revision then return end
 if input.stop then core.request_shutdown('Returned to Ponyhaven',false,0);return end
 local updated={}
 for _,entry in ipairs(input.players or {})do
  if type(entry.name)=='string' and entry.name:match('^ph_[a-f0-9]+$') and #entry.name<=24 and pony_sheets[entry.pony] and valid_state(entry.state) then
   updated[entry.name]=entry
   if not registry[entry.name] or registry[entry.name].password~=entry.password then
    core.set_player_password(entry.name,core.get_password_hash(entry.name,entry.password))
    core.set_player_privs(entry.name,{interact=true,shout=true})
   end
  end
 end
 registry=updated;revision=input.revision
 ph.view_ranges=input.viewRanges or {}
 for name in pairs(players)do if not registry[name] then core.kick_player(name,'This party invitation has ended.')end end
 for _,ack in ipairs(input.acks or {})do acknowledge(ack.player,ack.state)end
 for _,event in ipairs(input.inputs or {})do if ph.book_input then ph.book_input(event)end end
 ph.emit({kind='registry',revision=revision})
end
core.after(0,bridge)
core.register_on_prejoinplayer(function(name)
 if not registry[name] then return 'Join Equestria from your Ponyhaven party invitation.' end
end)

local function ground(x,z,near)
 x=math.floor(x+.5);z=math.floor(z+.5)
 for delta=0,16 do for _,sign in ipairs({-1,1})do
  local y=math.floor(near)+delta*sign
  if ph.source_solid(x,y,z) and not ph.source_solid(x,y+1,z) and not ph.source_solid(x,y+2,z) then return {x=x,y=y+.5,z=z}end
 end end
end
local function travel(player,target)
 local name=player:get_player_name();local g=players[name];if not g then return end
 g.travel=true;g.last_portal=seconds+3
 if ph.prepare_scenery then ph.prepare_scenery(name,target)end
 player:set_physics_override({gravity=0,speed=0})
 core.emerge_area(vector.offset(target,-16,-8,-16),vector.offset(target,16,8,16),function(_,action,remaining)
  if remaining~=0 then return end
  local p=core.get_player_by_name(name);if not p or players[name]~=g then return end
  p:set_pos(position(target,.15));p:set_physics_override({gravity=1,speed=1});g.travel=false;g.checkpoint=copy(target);persist(name)
 end)
end
ph.travel=travel
local avatar_views={}
ph.avatar_views=avatar_views
function ph.sprite_column(facing,view_yaw)
 local octant=math.floor(((view_yaw-facing)%(math.pi*2))/(math.pi/4)+.5)%8
 return (octant+4)%8
end
local function update_avatar(self)
 local p=self.owner and core.get_player_by_name(self.owner);local viewer=self.viewer and core.get_player_by_name(self.viewer);local g=self.owner and players[self.owner]
 if not p or not viewer or not g then self.object:remove();return end
 local view_yaw=viewer:get_look_horizontal()
 if self.viewer~=self.owner then
  local camera=vector.offset(viewer:get_pos(),0,1.5,0)
  if viewer:get_camera().mode=='third' then camera=vector.subtract(camera,vector.multiply(viewer:get_look_dir(),3.2))end
  local direction=vector.subtract(position(p:get_pos(),1),camera);view_yaw=math.atan2(-direction.x,direction.z)
 end
 local sheet=pony_sheets[g.pony][g.motion or 'idle'] or pony_sheets[g.pony].idle
 local column=ph.sprite_column(g.facing or 0,view_yaw)
 local frame=math.floor((seconds-(g.motion_started or 0))/(g.motion=='run' and .065 or .12))%sheet.frames
 local key=sheet.texture..':'..column..':'..frame
 if key==self.frame_key then return end;self.frame_key=key;self.column=column;self.frame=frame
 -- set_sprite is a transient packet, not part of entity initialization. Keep
 -- the actual frame in properties as well, so late join/re-entry is correct.
 self.object:set_properties({textures={sheet.texture},spritediv={x=sheet.columns,y=sheet.frames},initial_sprite_basepos={x=column,y=frame},visual_size={x=sheet.width/sheet.pixelsPerNode,y=sheet.height/sheet.pixelsPerNode}})
 self.object:set_sprite({x=column,y=frame},1,1,false)
end
ph.update_avatar=update_avatar
local function set_motion(name,motion)
 local g=players[name];if not g or g.motion==motion then return end
 g.motion=motion;g.motion_started=seconds
 for _,obj in pairs(avatar_views[name] or {})do if obj:get_pos()then update_avatar(obj:get_luaentity())end end
end
ph.set_motion=set_motion
core.register_entity('ponyhaven:avatar',{initial_properties={physical=false,visual='sprite',textures={'eq_blank.png'},pointable=false,static_save=false,glow=1},on_step=update_avatar})
local function ensure_avatar(player,g)
 local name=player:get_player_name();local views=avatar_views[name] or {};avatar_views[name]=views
 for _,viewer in ipairs(core.get_connected_players())do local id=viewer:get_player_name();local obj=views[id]
  if id==name or distance(viewer:get_pos(),player:get_pos())<180 then
   if not obj or not obj:get_pos()then
    obj=core.add_entity(position(player:get_pos(),1),'ponyhaven:avatar')
    if obj then local self=obj:get_luaentity();self.owner=name;self.viewer=id;obj:set_observers({[id]=true});obj:set_attach(player,'',{x=0,y=10,z=0},{x=0,y=0,z=0},true);views[id]=obj;update_avatar(self);if id==name then avatars[name]=obj end end
   end
  elseif obj then obj:remove();views[id]=nil end
 end
 for id,obj in pairs(views)do if not core.get_player_by_name(id)then obj:remove();views[id]=nil end end
end
core.register_on_joinplayer(function(player)
 local name,entry=player:get_player_name(),registry[player:get_player_name()];if not entry then return end
 local g=load_player(name,entry)
 player:set_properties({visual='sprite',textures={'eq_blank.png'},visual_size={x=1,y=1},collisionbox={-.3,0,-.3,.3,1.45,.3},eye_height=1.2,zoom_fov=72,stepheight=.7,makes_footstep_sound=false})
 player:set_camera({mode='third'});player:set_eye_offset({x=0,y=0,z=0},{x=0,y=3,z=-5})
 player:hud_set_flags({hotbar=false,healthbar=false,crosshair=true,wielditem=false,breathbar=false})
 player:get_inventory():set_size('main',8);player:hud_set_hotbar_itemcount(8);g.wield_index=player:get_wield_index()
 player:set_inventory_formspec('formspec_version[6]size[9,5]label[.5,.5;Equestria]label[.5,1.1;Press E to talk, collect or open treasure.]label[.5,1.7;Press I to open the travel map.]button_exit[3,3;3,.8;close;Keep exploring]')
 g.facing=player:get_look_horizontal()
 g.hud=player:hud_add({type='text',position={x=.025,y=.035},alignment={x=1,y=1},offset={x=0,y=0},number=0xfff5db,size={x=1,y=0},text=''})
 g.questhud=player:hud_add({type='text',position={x=.025,y=.13},alignment={x=1,y=1},number=0xffe2a1,size={x=1,y=0},text=''})
 travel(player,g.checkpoint or locations.towns[1]);notice(name,'Welcome to Equestria! E: interact · I: travel map · X: spin dash')
 ph.emit({kind='joined',player=name});sync(name)
end)
core.register_on_leaveplayer(function(player)
 local name=player:get_player_name();persist(name)
 for _,obj in pairs(avatar_views[name] or {})do obj:remove()end;avatar_views[name]=nil;avatars[name]=nil
 local g=players[name];if g then for _,obj in pairs(g.objects)do obj:remove()end end
 players[name]=nil;ph.emit({kind='left',player=name})
end)
-- Pony-lore themed items grouped by quest theme. Each quest chain uses
-- thematically related items so multi-step quests tell a small story.
local lore_items={
 harmony={'Element of Kindness shard','Element of Laughter fragment','Element of Honesty crystal','Element of Generosity gem','Element of Loyalty badge','Element of Magic spark','Rainbow of Light prism'},
 cooking={'zap-apple jam jar','Apple family cider barrel','Sugarcube Corner recipe scroll','enchanted cupcake tray','Crystal berry preserves','Cloudsdale ambrosia flask','Canterlot royal tea leaves'},
 fashion={'silk from Carousel Boutique','Sapphire Shores stage ribbon','Canterlot gala corsage','crystal filigree brooch','Wonderbolt flight scarf','enchanted moonthread spool','Starswirl hat pattern'},
 magic={'Starswirl scroll fragment','Clover the Clever journal page','ancient alicorn rune stone','Twilight research notes','Luna dream ward sigil','Celestia sunrise medallion','Cadance love crystal'},
 nature={'Everfree Forest herb bundle','parasprite repellent potion','Fluttershy wildlife survey','Zecora remedy ingredients','timber wolf fang sample','poison joke antidote','breezies pollen satchel'},
 history={'Pillars of Equestria map piece','Daring Do expedition journal','Canterhorn mountain compass','old Ponyville town charter','Crystal Empire memory orb','Cloudsdale weather almanac','Griffin kingdom treaty scroll'},
 friendship={'pen-pal letter bundle','friendship journal entry','Cutie Mark Crusaders badge','surprise party supplies','Best Friends Day garland','group photo album','thank-you card collection'},
}
local themes={'harmony','cooking','fashion','magic','nature','history','friendship'}
-- NPC personality lines: opening, midway, and completion dialogue per NPC type
local npc_greetings={
 ['Applejack']={'Howdy partner!','Ah need a hoof with somethin\' important.','Much obliged, sugarcube!'},
 ['Starlight Glimmer']={'Oh, hello there!','I\'ve been studying something fascinating.','You\'re a natural at this!'},
 ['Spitfire']={'At ease, recruit!','The Wonderbolts need this handled fast.','Top-notch work, cadet!'},
 ['Royal Night Guard']={'Halt, citizen — actually, could you help?','Princess Luna requires this urgently.','The Night Guard thanks you.'},
 ['Saffron Masala']={'Welcome to the Tasty Treat!','My father\'s recipe needs one more ingredient.','The dish is complete — wonderful!'},
 ['Mrs Sparkle']={'Oh my, Twilight\'s friend! Perfect timing.','Twilight left these notes everywhere when she was little.','You remind me of her — always helping.'},
}
local default_greetings={'Hello, friend!','I could use some help with something.','Thank you so much!'}
local function npc_dialogue(npc,stage)
 local lines=npc_greetings[npc.name]or default_greetings
 return lines[math.min(stage,#lines)]or lines[#lines]
end
-- Multi-step quest chains: each quest has 2-4 steps with different objectives.
-- Still fully procedural: theme, items, and targets are seeded per player+quest.
local function generate_quest(g,npc)
 local quest_seed=hash(g.uid..':'..npc.id..':'..g.quests)
 local theme_index=quest_seed%#themes+1;local theme=themes[theme_index]
 local pool=lore_items[theme];local steps=2+quest_seed%3 -- 2 to 4 steps
 local chain={}
 for i=1,steps do
  local item_seed=hash(g.uid..':item:'..g.quests..':'..i)
  local target_seed=hash(g.uid..':target:'..g.quests..':'..i)
  chain[i]={
   item=pool[item_seed%#pool+1],
   target=copy(npc.targets[target_seed%#npc.targets+1]),
   picked=false,
  }
 end
 return {npc=npc.id,theme=theme,steps=chain,current=1,total=steps}
end
local function quest_objective(g)
 if not g.quest then return nil end
 local q=g.quest;local step=q.steps[q.current]
 if not step then return nil end
 if step.picked then
  return locations.npcs[q.npc+1],'Return '..step.item..' to '..locations.npcs[q.npc+1].name..' (step '..q.current..'/'..q.total..')'
 else
  return step.target,'Find '..step.item..' for '..locations.npcs[q.npc+1].name..' (step '..q.current..'/'..q.total..')'
 end
end
local function talk(player,npc)
 local name=player:get_player_name();local g=players[name];if not g or distance(player:get_pos(),npc)>4 then return end
 if g.quest then
  if g.quest.npc~=npc.id then notice(name,'Finish your quest for '..locations.npcs[g.quest.npc+1].name..' first.');return end
  local step=g.quest.steps[g.quest.current]
  if not step.picked then
   notice(name,npc.name..': '..npc_dialogue(npc,2)..' Please bring back the '..step.item..'. Follow the quest marker.');return
  end
  -- Each delivered step counts as one 150-bit delivery for Ponyhaven, so a
  -- chain pays 150 per step as advertised.
  g.quests=g.quests+1
  if g.quest.current<g.quest.total then
   g.quest.current=g.quest.current+1;local next_step=g.quest.steps[g.quest.current]
   persist(name);sync(name);notice(name,npc.name..': Excellent! +150 bits. Now I also need the '..next_step.item..'. '..g.quest.current..'/'..g.quest.total..' steps.')
  else
   local reward=150*g.quest.total
   g.quest=nil;persist(name);sync(name)
   notice(name,npc.name..': '..npc_dialogue(npc,3)..' Quest chain complete: '..reward..' bits earned in total!')
  end
  return
 end
 g.quest=generate_quest(g,npc);persist(name)
 local step=g.quest.steps[1]
 notice(name,npc.name..': '..npc_dialogue(npc,1)..' Find the '..step.item..' and bring it back. ('..g.quest.total..' steps, +'..150*g.quest.total..' bits)')
end
local function open_chest(player,chest)
 local name=player:get_player_name();local g=players[name];if not g or distance(player:get_pos(),chest)>4 then return end
 local index,c,key=chest.id+1,g.chests[chest.id+1],tostring(chest.id+1)
 if g.pending[key]then notice(name,'Saving this treasure to Ponyhaven…');sync(name);return end
 local remaining=c.openedAt>0 and c.openedAt+86400000-now() or 0
 if remaining>0 then notice(name,'Treasure '..index..' refills in '..math.ceil(remaining/3600000)..' hours.');return end
 g.pending[key]={kind='chest',chest=chest.id,sequence=c.sequence+1,at=now()};persist(name);sync(name)
 notice(name,'Treasure '..index..' found! Saving one rare card or new pet…')
end
ph.open_chest=open_chest;ph.talk=talk
local function collect_parcel(player)
 local name=player:get_player_name();local g=players[name]
 if g and g.quest then
  local step=g.quest.steps[g.quest.current]
  if step and not step.picked and distance(player:get_pos(),step.target)<3 then
   step.picked=true;persist(name)
   notice(name,'Found the '..step.item..'! Bring it back to '..locations.npcs[g.quest.npc+1].name..'. ('..g.quest.current..'/'..g.quest.total..')')
  end
 end
end
ph.collect_parcel=collect_parcel
local function interact(player)
 local name=player:get_player_name();local g=players[name];if not g then return end
 if ph.interact_extra and ph.interact_extra(player)then return end
 if g.quest then local step=g.quest.steps[g.quest.current];if step and not step.picked and distance(player:get_pos(),step.target)<3 then collect_parcel(player);return end end
 for _,npc in ipairs(locations.npcs)do if distance(player:get_pos(),npc)<3 then talk(player,npc);return end end
 for _,chest in ipairs(locations.chests)do if distance(player:get_pos(),chest)<3 then open_chest(player,chest);return end end
 local p=position(player:get_pos(),1.1)
 for hit in core.raycast(p,vector.add(p,vector.multiply(player:get_look_dir(),4)),false,false)do
  if hit.type=='node' then local n=core.get_node(hit.under);local use=ph.use_nodes[n.name];if use then use(hit.under,n)end;break end
 end
end
local function observer(obj,name)obj:set_observers({[name]=true})end
core.register_entity('ponyhaven:npc',{initial_properties={physical=false,visual='sprite',textures={'eq_blank.png'},pointable=false,static_save=false},
 on_rightclick=function(self,p)if self.npc then talk(p,self.npc)end end,on_punch=function(self,p)if p and p:is_player() and self.npc then talk(p,self.npc)end end})
core.register_entity('ponyhaven:treasure',{initial_properties={physical=false,visual='cube',textures={'eq_chest.png','eq_chest.png','eq_chest.png','eq_chest.png','eq_chest.png','eq_chest.png'},visual_size={x=1.1,y=.8,z=.8},selectionbox={-.6,-.4,-.5,.6,.4,.5},pointable=true,static_save=false},
 on_rightclick=function(self,p)if self.owner==p:get_player_name()then open_chest(p,self.chest)end end,on_punch=function(self,p)if p and p:is_player() and self.owner==p:get_player_name()then open_chest(p,self.chest)end end})
core.register_entity('ponyhaven:ring',{initial_properties={physical=false,visual='sprite',textures={'eq_ring.png'},visual_size={x=.7,y=.7},pointable=false,static_save=false,glow=8},
 on_step=function(self)
  if not self.owner then return end;local p=core.get_player_by_name(self.owner);local g=players[self.owner]
  if not p or not g then self.object:remove();return end
  if distance(p:get_pos(),self.object:get_pos())<1.5 then
   if not g.marks[self.key]then g.marks[self.key]=true;g.rings=g.rings+1;g.bag=g.bag+1;persist(self.owner)end
   g.objects[self.key]=nil;self.object:remove()
  end
 end})
core.register_entity('ponyhaven:parcel',{initial_properties={physical=false,visual='sprite',textures={'eq_parcel.png'},visual_size={x=.8,y=.8},pointable=true,static_save=false,glow=5},
 on_rightclick=function(self,p)if self.owner==p:get_player_name()then collect_parcel(p)end end,on_punch=function(self,p)if p and p:is_player()and self.owner==p:get_player_name()then collect_parcel(p)end end})
local function enemy_hit(self,player)
 local name=player:get_player_name();local g=players[name];if not g then return end
 local p,e=player:get_pos(),self.object:get_pos();if not e or distance(p,e)>2 then return end
 if g.roll>0 or (player:get_velocity().y<-.5 and p.y>e.y+.3)then
  enemy_respawn[self.key]=seconds+90;enemies[self.key]=nil;self.object:remove();player:add_velocity({x=0,y=4,z=0});notice(name,'Changeling sent packing!');return
 end
 if ph.hurt then ph.hurt(player,18,e);return end
 if seconds<(g.invulnerable or 0)then return end;g.invulnerable=seconds+3
 if g.bag==0 then travel(player,g.checkpoint or locations.towns[1]);notice(name,'A little tumble. Back to your last safe stop.')
 else
  g.bag=0;local away=vector.direction(e,p);player:add_velocity({x=away.x*10,y=6,z=away.z*10});notice(name,'Your carried rings scattered! Saved bits stay in Ponyhaven.')
 end
end
core.register_entity('ponyhaven:changeling',{initial_properties={physical=true,collide_with_objects=false,visual='sprite',textures={'eq_blank.png'},visual_size={x=1.5,y=1.5},collisionbox={-.35,-.7,-.35,.35,.7,.35},stepheight=.7,pointable=true,static_save=false},
 on_punch=function()end,
 hurt=function(self,amount,player)
  self.hp=(self.hp or 45)-amount
  ph.health_bar(self,1.1,1.8)
  if self.hp<=0 then enemy_respawn[self.key]=seconds+90;enemies[self.key]=nil;self.object:remove()end
 end,
 on_step=function(self,dt)
  if not self.key then return end;ph.step_warning(self);self.timer=(self.timer or 0)+dt;if self.timer<.15 then return end;self.timer=0
  local pos=self.object:get_pos();local target,nearest=nil,22
  for _,p in ipairs(core.get_connected_players())do local d=distance(pos,p:get_pos());if d<nearest then target=p;nearest=d end end
  if target then
   if self.attack_target and seconds>=(self.release_at or 0)then
    local victim=core.get_player_by_name(self.attack_target);self.attack_target=nil;self.next_attack=seconds+3
    if victim and distance(pos,victim:get_pos())<28 then
     if distance(pos,victim:get_pos())<2 then enemy_hit(self,victim)
     else local start=position(pos,.3);ph.shoot(nil,start,vector.direction(start,position(victim:get_pos(),.9)),{enemy=true,dark=true,speed=14,radius=2,damage=18,colour='#7b549d'});ph.sound('orb',start,.35,.65)end
    end
    if not self.object:get_pos()then return end
   elseif not self.attack_target and seconds>=(self.next_attack or 0)then
    self.attack_target=target:get_player_name();self.release_at=seconds+.85;ph.attack_warning(self,.85)
   end
   local dir=vector.direction(pos,target:get_pos());local floor=ground(pos.x+dir.x*2,pos.z+dir.z*2,pos.y-1)
   local velocity=self.object:get_velocity()
   local speed=(self.attack_target or nearest<9)and 0 or (self.slow_until or 0)>seconds and 1 or 3.8
   if floor and math.abs(floor.y-pos.y)<2 then self.object:set_velocity({x=dir.x*speed,y=velocity.y,z=dir.z*speed})else self.object:set_velocity({x=0,y=velocity.y,z=0})end
  else local velocity=self.object:get_velocity();self.object:set_velocity({x=0,y=velocity.y,z=0})end
 end})
local function populate(player)
 local name=player:get_player_name();local g=players[name];if not g or g.travel then return end
 local p=player:get_pos();local day=tostring(math.floor(os.time()/86400));if g.ring_day~=day then g.ring_day=day;g.marks={};persist(name)end
 for _,npc in ipairs(locations.npcs)do
  if distance(p,npc)<130 and (not npc_objects[npc.id] or not npc_objects[npc.id]:get_pos())then
   local sprite=npc_sheets[npc.pony];local height=math.min(2.3,sprite.height/60);local obj=core.add_entity(position(npc,height/2),'ponyhaven:npc')
   obj:get_luaentity().npc=npc;obj:set_properties({textures={sprite.texture},spritediv={x=1,y=sprite.frames},visual_size={x=sprite.width/sprite.height*height,y=height},nametag=npc.name,nametag_color='#fff3d8',selectionbox={-.5,-height/2,-.5,.5,height/2,.5}})
   obj:set_sprite({x=0,y=0},sprite.frames,sprite.delay,false);npc_objects[npc.id]=obj
  end
 end
 for _,chest in ipairs(locations.chests)do local key='chest:'..chest.id
  if distance(p,chest)<100 and not g.objects[key]then local obj=core.add_entity(position(chest,.4),'ponyhaven:treasure');local lua=obj:get_luaentity();lua.owner=name;lua.chest=chest;observer(obj,name);g.objects[key]=obj end
 end
 local q=g.quest
 if q then
  local step=q.steps[q.current]
  if step and not step.picked and distance(p,step.target)<100 then
   if not g.objects.parcel then local obj=core.add_entity(position(step.target,.65),'ponyhaven:parcel');obj:get_luaentity().owner=name;observer(obj,name);g.objects.parcel=obj end
  elseif g.objects.parcel then g.objects.parcel:remove();g.objects.parcel=nil end
 elseif g.objects.parcel then g.objects.parcel:remove();g.objects.parcel=nil end
 local tx,tz=math.floor(p.x/24),math.floor(p.z/24)
 for dx=-2,2 do for dz=-2,2 do
  local x,z=(tx+dx)*24,(tz+dz)*24;local cell=(tx+dx)..':'..(tz+dz)..':'..math.floor(p.y/24)
  local seed=hash(cell..':'..day)
  for i=0,3 do local key='ring:'..day..':'..cell..':'..i
   if not g.marks[key] and not g.objects[key]then
    local at=ground(x+3+i*5,z+4+seed%12,p.y-1)
    if at then local obj=core.add_entity(position(at,.8),'ponyhaven:ring');local lua=obj:get_luaentity();lua.owner=name;lua.key=key;observer(obj,name);g.objects[key]=obj end
   end
  end
 end end
 for key,obj in pairs(g.objects)do local pos=obj:get_pos();if not pos or distance(p,pos)>140 then obj:remove();g.objects[key]=nil end end
 local ex,ez=math.floor(p.x/64),math.floor(p.z/64)
 local key=ex..':'..ez;local seed=hash(key)
 if npc_sheets.changeling and seed%3==0 and not enemies[key] and seconds>(enemy_respawn[key] or 0)then
  local far=true;for _,town in ipairs(locations.towns)do if distance(p,town)<130 then far=false end end
  local at=far and ground(ex*64+20+seed%24,ez*64+20+(seed%17),p.y-1)
  if at then local sprite=npc_sheets.changeling;local obj=core.add_entity(position(at,.75),'ponyhaven:changeling');obj:get_luaentity().key=key
   obj:set_properties({textures={'eq_changeling_front.png'},spritediv={x=1,y=7},visual_size={x=1.5,y=1.5},nametag='Changeling',nametag_color='#aadfc1'})
   obj:set_sprite({x=0,y=0},7,.11,false);obj:set_acceleration({x=0,y=-18,z=0});enemies[key]=obj;ph.health_bar(obj:get_luaentity(),1.1,1.8)
  end
 end
 for enemy_key,obj in pairs(enemies)do
  local pos=obj:get_pos();local nearby=false
  if pos then for _,friend in ipairs(core.get_connected_players())do if distance(pos,friend:get_pos())<160 then nearby=true;break end end end
  if not nearby then obj:remove();enemies[enemy_key]=nil end
 end
end
local function map_form(player)
 if ph.map_form then ph.map_form(player);return end
 local name=player:get_player_name();local g=players[name];local opened=0
 for _,c in ipairs(g.chests)do if c.openedAt>0 and c.openedAt+86400000>now()then opened=opened+1 end end
 local form='formspec_version[6]size[12,8]bgcolor[#28263dee;true]label[.6,.6;EQUESTRIA — a journey with friends]label[.6,1.1;'..opened..' / 50 treasures resting · each refills after 24 hours]'
 for i,t in ipairs(locations.towns)do form=form..'button_exit[.6,'..(1.7+i*.85)..';5,.7;town_'..i..';Travel to '..core.formspec_escape(t.name)..']'end
 form=form..'label[6.3,2.5;W A S D — move]\nlabel[6.3,3;Space — jump / pony ability]\nlabel[6.3,3.5;Hold X, release — spin dash]\nlabel[6.3,4;E — talk / collect / treasure]\nlabel[6.3,4.5;Mouse — turn camera]\nlabel[.6,6.7;World: Equestria 6 / EagleCraft.fr · Brohoof.com · CaptainZepto]\nbutton_exit[8.2,6.8;3,.7;close;Keep exploring]'
 core.show_formspec(name,'ponyhaven:travel',form)
end
core.register_on_player_receive_fields(function(player,form,fields)
 if form~='ponyhaven:travel'then return end
 local g=players[player:get_player_name()];if g then g.map_open=false end
 for i,t in ipairs(locations.towns)do if fields['town_'..i]then travel(player,t);return end end
end)
core.register_chatcommand('map',{description='Open the Equestria travel map.',func=function(name)local p=core.get_player_by_name(name);if p then map_form(p)end;return true end})
core.register_on_respawnplayer(function(player)travel(player,locations.towns[1]);return true end)

local function movement(player,g,dt)
 if g.travel then return end
 ensure_avatar(player,g)
 local p,v,c=player:get_pos(),player:get_velocity(),player:get_player_control();local old=g.previous
 local feet=core.get_node_or_nil({x=p.x,y=p.y-.12,z=p.z});local def=feet and core.registered_nodes[feet.name];local grounded=def and def.walkable and math.abs(v.y)<.8
 if grounded then g.air_used=false;g.air_ready=false;g.flying=false
 elseif not c.jump then g.air_ready=true end
 local look=player:get_look_dir();local length=math.sqrt(look.x*look.x+look.z*look.z);local direction={x=look.x/math.max(.001,length),z=look.z/math.max(.001,length)}
 if (c.up or c.down or c.left or c.right) and v.x*v.x+v.z*v.z>.2 then g.facing=math.atan2(-v.x,v.z)end
 local body=core.get_node_or_nil(vector.offset(p,0,.7,0));local bodydef=body and core.registered_nodes[body.name];local swimming=bodydef and bodydef.liquid_move_physics
 if c.aux1 and grounded then g.charge=math.min(1.4,g.charge+dt)
 elseif old.aux1 and g.charge>0 then local speed=18+g.charge*14;player:add_velocity({x=direction.x*speed-v.x,y=1,z=direction.z*speed-v.z});g.roll=1.2;g.charge=0 end
 g.roll=math.max(0,g.roll-dt)
 if c.jump and not old.jump and not grounded and g.air_ready and not g.air_used then
  g.air_used=true;g.air_ready=false
  if g.pony=='applejack'then player:add_velocity({x=0,y=11-v.y,z=0})
  elseif g.pony=='twilight' or g.pony=='trixie'then player:add_velocity({x=direction.x*24-v.x,y=3-v.y,z=direction.z*24-v.z});g.roll=.45
  elseif g.pony=='fluttershy' or g.pony=='derpy' or g.pony=='luna'then g.flying=true end
 end
 local gravity=1;local motion='idle'
 if swimming then motion='swim';g.flying=false;g.charge=0;g.air_used=false;gravity=.3
 elseif g.flying then gravity=.2;if c.jump then player:add_velocity({x=0,y=math.max(0,6-v.y)*math.min(1,dt*5),z=0})end;motion='fly'
 elseif g.pony=='rarity' and c.jump and not grounded then gravity=.12;motion='glide';local wall=core.get_node_or_nil({x=p.x+direction.x*.7,y=p.y+.5,z=p.z+direction.z*.7});local wd=wall and core.registered_nodes[wall.name];if wd and wd.walkable then player:add_velocity({x=0,y=(4-v.y)*math.min(1,dt*5),z=0});motion='climb'end
 elseif g.roll>0 or g.charge>0 then motion='roll'
 elseif not grounded then motion='jump'
 elseif v.x*v.x+v.z*v.z>80 then motion='run'
 elseif v.x*v.x+v.z*v.z>.2 then motion='walk'end
 if grounded and seconds<(g.attack_pose_until or 0)then motion='walk'end
 player:set_physics_override({gravity=gravity,speed_walk=g.charge>0 and .1 or 1.5,acceleration_default=.85,acceleration_air=.8});set_motion(player:get_player_name(),motion)
 if ph.combat_step then ph.combat_step(player,g,dt,c,old,motion)end
 if c.zoom and not old.zoom then interact(player)end
 if c.sneak and not old.sneak then map_form(player)end
 if p.y<ph.world_info.min.y-10 then travel(player,g.checkpoint or locations.towns[1])end
 if seconds>(g.last_portal or 0)then for _,portal in ipairs(locations.teleports)do local a,b=portal.min,portal.max;if p.x>=a.x and p.x<=b.x and p.y>=a.y and p.y<=b.y and p.z>=a.z and p.z<=b.z then travel(player,portal.target);break end end end
 g.previous=c
end
ph.movement=movement
core.register_globalstep(function(dt)
 seconds=seconds+dt;tick=tick+dt
 ph.seconds=seconds
 for _,player in ipairs(core.get_connected_players())do local g=players[player:get_player_name()];if g then movement(player,g,dt)end end
 if tick<.5 then return end;tick=0;bridge()
 for _,player in ipairs(core.get_connected_players())do local name=player:get_player_name();local g=players[name]
  if g then
   populate(player);sync(name)
   local opened=0;for _,c in ipairs(g.chests)do if c.openedAt>0 and c.openedAt+86400000>now()then opened=opened+1 end end
   local hs=ph.hud_scale(name)
   if hs~=g.hud_scale then g.hud_scale=hs;player:hud_change(g.hud,'size',{x=hs,y=0});player:hud_change(g.questhud,'size',{x=hs,y=0})end
   player:hud_change(g.hud,'text',g.display..'  ·  Rings '..g.bag..'  ·  '..(g.rings*10+g.quests*150)..' bits earned  ·  Treasure '..opened..'/50\nSpace: jump / ability   X: spin dash   E: interact   I: travel map')
   local text=seconds<g.notice_until and g.notice or ''
   if text=='' and g.quest then local step=g.quest.steps[g.quest.current];if step then local target=step.picked and locations.npcs[g.quest.npc+1] or step.target;text=(step.picked and 'Return ' or 'Find ')..step.item..' · '..math.floor(distance(player:get_pos(),target))..' m ('..g.quest.current..'/'..g.quest.total..')' end end
   player:hud_change(g.questhud,'text',text)
  end
 end
end)
core.register_on_shutdown(function()for name in pairs(players)do persist(name)end end)
