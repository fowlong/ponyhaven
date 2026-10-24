local ph=ponyhaven
local encounters=assert(ph.read_json(ph.path..'/encounters.json'))
ph.encounters=encounters
local storage=core.get_mod_storage()
local boss_objects,book_objects,loot_objects={},{},{}
local colours=ph.pony_colours
-- Unarmed right click: pegasi throw a cloud puff, earth ponies a dirt clod and
-- unicorns a rainbow orb. Damage and digging are identical for every kind.
local basic_shots={pegasus={texture='eq_cloud_orb.png',colour='#e6f0ff',label='cloud puff'},earth={texture='eq_dirt_orb.png',colour='#b07a4a',label='dirt clod'},unicorn={texture='eq_orb.png',label='rainbow orb'}}
function ph.basic_shot(pony)return basic_shots[ph.pony_kind(pony)]end
local spells={'Risier','Fiera','Disperim','Sanium','Expol','Flurra','Fulst'}
local book_ids,book_positions={},{}
assert(#encounters.books==7,'Equestria must contain exactly seven unique spellbooks')
for _,book in ipairs(encounters.books)do
 local key=book.x..':'..book.y..':'..book.z
 assert(spells[book.id]==book.name and not book_ids[book.id] and not book_positions[key],'Duplicate or invalid spellbook location')
 book_ids[book.id]=true;book_positions[key]=true
end
local clock=function()return ph.seconds or 0 end
local function offset(p,y)return vector.offset(p,0,y or 0,0)end
local function particle(p,texture,size,time,velocity)
 core.add_particle({pos=p,velocity=velocity or vector.zero(),expirationtime=time or .35,size=size or 6,glow=14,texture=texture,collisiondetection=false})
end
local function aura(p,r,colour,time)
 for i=1,28 do local a=i*math.pi/14;particle(vector.offset(p,math.cos(a)*r,.15,math.sin(a)*r),'eq_spark.png^[multiply:'..colour,5,time or .7)end
end
ph.aura=aura
local function hostile(obj)local e=obj:get_luaentity();return e and e.hurt and (e.name=='ponyhaven:changeling' or e.name=='ponyhaven:boss') and e end
local function hurt_at(p,r,amount,owner,slow)
 local player=owner and core.get_player_by_name(owner)
 for _,obj in ipairs(core.get_objects_inside_radius(p,r+15))do
  local e=hostile(obj)
  if e and vector.distance(obj:get_pos(),p)<=r+(e.radius or .7) then
   if slow then e.slow_until=clock()+slow end;e:hurt(amount,player)
  end
 end
end
function ph.destroy_sphere(p,r)
 r=math.min(6,math.max(0,r));if r==0 then return 0 end
 p=vector.round(p);local minp,maxp=vector.offset(p,-r-2,-r-2,-r-2),vector.offset(p,r+2,r+2,r+2)
 local vm=VoxelManip();local emin,emax=vm:read_from_map(minp,maxp);local area=VoxelArea:new({MinEdge=emin,MaxEdge=emax});local data,param2=vm:get_data(),vm:get_param2_data();local air=core.get_content_id('air');local count=0
 for z=p.z-r,p.z+r do for y=p.y-r,p.y+r do for x=p.x-r,p.x+r do
  if (x-p.x)^2+(y-p.y)^2+(z-p.z)^2<=r*r then
   local at=area:index(x,y,z);local id=data[at]
   if ph.destructible[id] or ph.surface_original[id] then
    if ph.original_content(id,param2[at])~=air then count=count+1 end
    data[at]=air;param2[at]=0
   end
  end
 end end end
 if core.settings:get_bool('ponyhaven_smooth',false)then ph.smooth_volume(data,area,vector.offset(p,-r-1,-r-1,-r-1),vector.offset(p,r+1,r+1,r+1),param2)end
 -- Crater rims become outer edges; the read area keeps the one-node margin.
 ph.bevel_volume(data,area,vector.offset(p,-r-1,-r-1,-r-1),vector.offset(p,r+1,r+1,r+1))
 vm:set_data(data);vm:set_param2_data(param2);vm:write_to_map(true);vm:update_liquids();vm:close()
 return count
end
function ph.hurt(player,damage,source)
 local g=ph.players[player:get_player_name()];if not g or g.travel or clock()<(g.invulnerable or 0) or clock()<(g.shield or 0)then return end
 g.hp=math.max(0,g.hp-damage);g.invulnerable=clock()+.7
 particle(offset(player:get_pos(),1),'eq_aura.png^[multiply:#ff8fa3',25,.3)
 if source then local dir=vector.direction(source,player:get_pos());player:add_velocity({x=dir.x*5,y=3,z=dir.z*5})end
 if g.hp==0 then g.hp=100;g.bag=0;ph.travel(player,g.checkpoint or ph.locations.towns[1]);ph.notice(player:get_player_name(),'Back at your safe stop. Your saved discoveries are safe.')end
end
local function impact(self,p)
 if self.hit then return end;self.hit=true
 local r=self.radius or 2
 aura(p,r,self.colour or '#cfb2ff',.45);particle(p,self.dark and 'eq_dark_orb.png'or self.texture or'eq_orb.png',r*12,.25);ph.impact_fx(p,r,self.colour or '#cfb2ff')
 if self.enemy then
  for _,player in ipairs(core.get_connected_players())do if vector.distance(offset(player:get_pos(),.7),p)<r then ph.hurt(player,self.damage,p)end end
 else hurt_at(p,r,self.damage,self.owner,self.slow);if self.dig then ph.destroy_sphere(p,self.dig)end end
 self.object:remove()
end
core.register_entity('ponyhaven:projectile',{initial_properties={physical=false,visual='sprite',textures={'eq_orb.png'},visual_size={x=.65,y=.65},pointable=false,static_save=false,glow=14},
 on_step=function(self,dt)
  if not self.previous then return end
  self.life=(self.life or 0)+dt;local p=self.object:get_pos()
  if self.life>8 then self.object:remove();return end
  for hit in core.raycast(self.previous,p,true,false)do
   if hit.type=='node' then impact(self,hit.intersection_point or p);return end
   if hit.type=='object' then
    local obj=hit.ref
    if self.enemy and obj:is_player() then impact(self,hit.intersection_point or p);return end
    if not self.enemy and hostile(obj)then impact(self,hit.intersection_point or p);return end
   end
  end
  self.previous=p;self.trail=(self.trail or 0)+dt
  if self.trail>.06 then self.trail=0;particle(p,self.enemy and 'eq_spark.png^[multiply:'..self.colour or self.texture or 'eq_orb.png',4,.22)end
 end})
local function shoot(owner,p,dir,opts)
 local obj=core.add_entity(p,'ponyhaven:projectile');if not obj then return end
 local e=obj:get_luaentity();for k,v in pairs(opts)do e[k]=v end;e.owner=owner;e.previous=p
 obj:set_velocity(vector.multiply(dir,opts.speed or 18));if opts.gravity then obj:set_acceleration({x=0,y=-opts.gravity,z=0})end
 if opts.enemy then obj:set_properties({textures={opts.dark and 'eq_dark_orb.png'or'eq_orb.png^[multiply:'..opts.colour},visual_size={x=1,y=1}})
 elseif opts.texture then obj:set_properties({textures={opts.texture}})end
 return obj
end
local function aim(player)
 local dir=player:get_look_dir();local p=offset(player:get_pos(),1.1)
 -- Spawn before the first obstacle, not on the far side of a nearby wall.
 return p,dir
end
-- A flat ribbon sweeps through the horizontal plane in front of the pony.
-- Client-side rotation keeps the trail smooth between server updates, and the
-- player attachment follows local movement without positional interpolation.
core.register_entity('ponyhaven:melee_trail',{initial_properties={physical=false,visual='mesh',mesh='eq_melee_arc.obj',textures={'eq_melee_trail.png'},
 visual_size={x=1,y=1,z=1},pointable=false,static_save=false,glow=14,shaded=false,use_texture_alpha=true,backface_culling=false},
 on_step=function(self,dt)self.life=(self.life or 0)+dt;if self.life>=.32 then self.object:remove()end end})
local function slash(player,g)
 local name=player:get_player_name();g.combo=clock()<(g.combo_until or 0) and (g.combo or 0)%3+1 or 1;g.combo_until=clock()+.85
 local p=offset(player:get_pos(),1);local yaw=player:get_look_horizontal();local dir={x=-math.sin(yaw),y=0,z=math.cos(yaw)};local colour=colours[g.pony];local size=2.7+g.combo*.35
 local trail=core.add_entity(p,'ponyhaven:melee_trail')
 if trail then
  local reverse=g.combo==2
  trail:set_properties({textures={'eq_melee_trail.png'..(reverse and '^[transformFX' or '')..'^[multiply:'..colour},
   visual_size={x=size,y=1,z=size},automatic_rotate=(reverse and -1 or 1)*math.rad(130)/.32})
  trail:set_attach(player,'',{x=0,y=({10,12,8})[g.combo],z=0},{x=0,y=-math.deg(yaw)+(reverse and -40 or 90),z=0},true)
 end
 for _,obj in ipairs(core.get_objects_inside_radius(p,15))do local e=hostile(obj)
  if e then local d=vector.subtract(obj:get_pos(),p);local length=vector.length(d)
   if length<size+(e.radius or .7) and vector.dot(vector.normalize(d),dir)>-.1 then e:hurt(({18,26,40})[g.combo],player);if ph.impact_fx then ph.impact_fx(obj:get_pos(),.9,colour)end end
  end
 end
 g.attack_until=clock()+.32;g.attack_pose_until=clock()+.3;g.facing=player:get_look_horizontal()
 if ph.sound then ph.sound('slash',p,.3,1+g.combo*.08)end
end
local fields={}
local function field(p,kind,owner,colour,duration)
 fields[#fields+1]={p=vector.new(p),kind=kind,owner=owner,colour=colour,until_at=clock()+duration,next=0}
end
local function target_point(player,range)
 local p,d=aim(player);local finish=vector.add(p,vector.multiply(d,range))
 for hit in core.raycast(p,finish,false,false)do if hit.type=='node' then return offset(hit.intersection_point or finish,.7)end end
 return finish
end
local function cast(player,g,secondary)
 local id=g.equipped;local cost=secondary and 32 or 14
 if g.mana<cost then g.attack_until=clock()+.8;ph.notice(player:get_player_name(),'Magic is recharging.');return end
 g.mana=g.mana-cost;g.attack_until=clock()+(secondary and 1.1 or .5);g.facing=player:get_look_horizontal()
 g.attack_pose_until=clock()+.35;if ph.sound then ph.sound('spell',player:get_pos(),.45,.8+id*.09)end
 local name=player:get_player_name();local p,d=aim(player);local colour=colours[g.pony]
 aura(player:get_pos(),1,colour,.35)
 if id==1 then
  if secondary then player:add_velocity({x=d.x*28,y=d.y*14+3,z=d.z*28});g.shield=clock()+.4
  else player:add_velocity({x=0,y=15-player:get_velocity().y,z=0});g.air_used=false end
 elseif id==2 then
  if secondary then shoot(name,p,d,{speed=20,radius=4,damage=55,dig=4,colour='#ffad62'})
  else local q=vector.add(p,vector.multiply(d,4));hurt_at(q,4,28,name);field(q,'fire',name,'#ffad62',3)end
 elseif id==3 then
  if secondary then
   local best,nearest=nil,35
   for _,obj in ipairs(core.get_objects_inside_radius(p,35))do local e=hostile(obj);if e then local delta=vector.subtract(obj:get_pos(),p);local dist=vector.length(delta)
    if dist<nearest and vector.dot(vector.normalize(delta),d)>.6 then best=obj;nearest=dist end
   end end
   if best then local e=best:get_luaentity();local at=best:get_pos();best:set_pos(offset(player:get_pos(),e.center_height or .75));player:set_pos(offset(at,-(e.center_height or .75)+.2));g.shield=clock()+1 end
  else
   for _,obj in ipairs(core.get_objects_inside_radius(p,12))do local e=hostile(obj);if e then obj:add_velocity(vector.multiply(vector.direction(p,obj:get_pos()),18));e:hurt(22,player)end end
   aura(p,12,'#c7a7ff',.6)
  end
 elseif id==4 then
  if secondary then g.shield=clock()+6 else g.hp=math.min(100,g.hp+30)end
 elseif id==5 then
  if secondary then field(target_point(player,14),'singularity',name,'#bc96ff',5)
  else shoot(name,p,d,{speed=17,gravity=5,radius=6,damage=60,dig=6,colour='#ed99ff'})end
 elseif id==6 then
  if secondary then field(target_point(player,16),'ice',name,'#a1efff',7)
  else shoot(name,p,d,{speed=22,radius=2.5,damage=30,slow=4,colour='#a1efff'})end
 elseif id==7 then
  if secondary then field(target_point(player,12),'lightning',name,'#fff39b',8)
  else
   local finish=vector.add(p,vector.multiply(d,48))
   for hit in core.raycast(p,finish,true,false)do
    if hit.type=='node' then finish=hit.intersection_point;break end
    if hit.type=='object' then local e=hostile(hit.ref);if e then e:hurt(55,player);finish=hit.intersection_point;break end end
   end
   local n=math.max(1,math.ceil(vector.distance(p,finish)*2));for i=0,n do particle(vector.add(p,vector.multiply(vector.subtract(finish,p),i/n)),'eq_spark.png^[multiply:#fff6a5',5,.22)end
   ph.impact_fx(finish,1.5,'#fff6a5')
  end
 end
end
function ph.book_input(event)
 local g=ph.players[event.player]
 if not g or type(event.sequence)~='number' or event.sequence<=(g.input_sequence or 0) or type(event.book)~='number' or event.book<1 or event.book>7 then return end
 g.input_sequence=event.sequence
 if g.travel or g.map_open then return end
 if not g.books[tostring(event.book)] then ph.notice(event.player,'Find the glowing '..spells[event.book]..' book first. Its marker is on the world map.');return end
 if g.equipped==event.book then g.equipped=nil else g.equipped=event.book end
 if ph.update_book_hud then ph.update_book_hud(core.get_player_by_name(event.player))end
 ph.notice(event.player,g.equipped and spells[g.equipped]..' equipped: left / right click cast its two spells.' or 'Book put away: left click aura slash, right click '..ph.basic_shot(g.pony).label..'.')
end
function ph.cycle_book(player,g,direction)
 if g.travel or g.map_open then return end
 local choices={0};for i=1,7 do if g.books[tostring(i)]then choices[#choices+1]=i end end
 local at=1;for i,id in ipairs(choices)do if id==(g.equipped or 0)then at=i;break end end
 local id=choices[(at-1+direction)%#choices+1];g.equipped=id~=0 and id or nil
 if ph.update_book_hud then ph.update_book_hud(player)end
 ph.notice(player:get_player_name(),g.equipped and spells[g.equipped]..' equipped.' or 'Book put away: aura slash / '..ph.basic_shot(g.pony).label..'.')
end
function ph.combat_step(player,g,dt,c,old,motion)
 local slot=player:get_wield_index()
 if g.wield_index and slot~=g.wield_index then
  local delta=(slot-g.wield_index)%8;ph.cycle_book(player,g,delta<=4 and 1 or -1)
 end
 g.wield_index=slot
 g.mana=math.min(100,g.mana+dt*8)
 if clock()>=(g.attack_until or 0) and (c.dig or c.place) then
  if g.equipped then cast(player,g,c.place)
  elseif c.place then local p,d=aim(player);local shot=ph.basic_shot(g.pony);shoot(player:get_player_name(),p,d,{speed=18,radius=3,damage=35,dig=3,texture=shot.texture,colour=shot.colour});g.attack_until=clock()+.65;g.attack_pose_until=clock()+.3;g.facing=player:get_look_horizontal();if ph.sound then ph.sound('orb',p,.45)end
  else slash(player,g)end
 end
 g.fx=(g.fx or 0)+dt
 if g.fx>.12 then
  g.fx=0;local p=offset(player:get_pos(),.7);local colour=colours[g.pony]
  if clock()<(g.shield or 0)then particle(p,'eq_aura.png^[multiply:#b6ffd9',30,.22)end
 end
end
core.register_entity('ponyhaven:spellbook',{initial_properties={physical=false,visual='sprite',textures={'wyrda_spell_book.png'},visual_size={x=1.7,y=1.7},pointable=false,static_save=false,glow=14},
 on_step=function(self)
  if not self.book then return end;self.object:set_pos(offset(self.book,1.7+math.sin(clock()*2)*.3))
 end})
core.register_entity('ponyhaven:boss_loot',{initial_properties={physical=false,visual='sprite',textures={'eq_blank.png'},pointable=false,static_save=false,glow=14}})
function ph.interact_extra(player)
 local name=player:get_player_name();local g=ph.players[name];local p=player:get_pos()
 for _,book in ipairs(encounters.books)do if vector.distance(p,book)<3.5 then
  local key=tostring(book.id)
  if not g.books[key]then g.pending['book:'..key]={kind='book',book=book.id};ph.persist(name);ph.sync(name);ph.notice(name,'Found '..book.name..'! Press '..book.id..' to equip or put it away.')
  else ph.notice(name,book.name..' is yours. Press '..book.id..' to equip or put it away.')end
  return true
 end end
 for _,boss in ipairs(encounters.bosses)do
  if storage:get_int('boss:'..boss.id)>os.time() and not g.bosses[boss.id] and vector.distance(p,boss)<6 then
   g.pending['boss:'..boss.id]={kind='boss',boss=boss.id};ph.persist(name);ph.sync(name);ph.notice(name,boss.name..' is joining your virtual pets!');return true
  end
 end
end
local function player_damage(p,r,damage)
 for _,player in ipairs(core.get_connected_players())do if vector.distance(offset(player:get_pos(),.8),p)<r then ph.hurt(player,damage,p)end end
end
local function boss_cast(self,target)
 local origin=offset(self.home,.6);local target_pos=offset(target:get_pos(),.2);local colour='#'..self.boss.colour
 self.turn=(self.turn or 0)%#self.boss.moves+1;local move=self.boss.moves[self.turn]
 ph.attack_warning(self,1.5);aura(origin,10,'#ff4268',1.5);ph.area_fx(origin,10,'#ff4268',1.5)
 if move=='meteors' then
  for i=0,2 do local q=vector.offset(target_pos,(i-1)*7,0,(i%2)*7);aura(q,5,'#ff4268',1.7);ph.area_fx(q,5.5,'#ff4268',1.8)
   core.after(1.8,function()if self.dead or not self.object:get_pos()then return end;particle(offset(q,4),'eq_orb.png^[multiply:'..colour,90,.4);ph.impact_fx(q,5.5,colour);ph.sound('boss',q,.6);player_damage(q,5.5,28)end)
  end
 elseif move=='nova' then
  core.after(1.5,function()if not self.dead and self.object:get_pos()then ph.impact_fx(origin,5,colour);ph.sound('boss',origin,.7);fields[#fields+1]={p=origin,kind='nova',colour=colour,until_at=clock()+2.6,start=clock(),next=0}end end)
 else
  local aim_at=vector.direction(offset(self.object:get_pos(),-2),offset(target_pos,1))
  for i=1,8 do particle(vector.add(origin,vector.multiply(aim_at,i*3)),'eq_spark.png^[multiply:'..colour,9,1.4)end
  core.after(1.5,function()
   if self.dead or not self.object:get_pos()then return end
   ph.sound('boss',self.home,.65)
   local p=offset(self.home,2)
   if move=='volley' then
    local a=math.atan2(aim_at.z,aim_at.x);for i=-2,2 do local angle=a+i*.16;shoot(nil,p,{x=math.cos(angle),y=aim_at.y*.2,z=math.sin(angle)},{enemy=true,speed=12,radius=2.2,damage=24,colour=colour})end
   elseif move=='spiral' then
    for wave=0,2 do core.after(wave*.6,function()if self.dead then return end;for i=0,11 do local a=i*math.pi/6+wave*.17;shoot(nil,p,{x=math.cos(a),y=0,z=math.sin(a)},{enemy=true,speed=10,radius=2,damage=20,colour=colour})end end)end
   else
    for i=0,3 do local a=i*math.pi/2;for j=-1,1 do shoot(nil,vector.offset(p,math.cos(a)*10,0,math.sin(a)*10),{x=math.cos(a+j*.12),y=0,z=math.sin(a+j*.12)},{enemy=true,speed=15,radius=2,damage=25,colour=colour})end end
   end
  end)
 end
end
core.register_entity('ponyhaven:boss',{initial_properties={physical=false,visual='sprite',textures={'eq_blank.png'},pointable=true,static_save=false,glow=2},
 hurt=function(self,amount,player)
  if self.dead then return end;self.hp=math.max(0,self.hp-amount);ph.health_bar(self,(self.center_height or 10)+1.5,10)
  self.object:set_properties({nametag=self.boss.name..'  '..string.rep('|',math.ceil(self.hp/self.maxhp*20))..'  '..self.hp..' / '..self.maxhp})
  if self.hp==0 then
   self.dead=true;storage:set_int('boss:'..self.boss.id,os.time()+86400);boss_objects[self.boss.id]=nil
   aura(self.home,12,'#fff4aa',1);self.object:remove()
   for _,p in ipairs(core.get_connected_players())do if vector.distance(p:get_pos(),self.home)<150 then ph.notice(p:get_player_name(),self.boss.name..' defeated! Collect the glowing pet at the arena (E).')end end
  end
 end,
 on_punch=function()end,
 on_step=function(self,dt)
  if not self.boss or self.dead then return end;ph.step_warning(self);self.timer=(self.timer or 2)-dt;if self.timer>0 then return end
  local target,nearest=nil,75;for _,p in ipairs(core.get_connected_players())do local d=vector.distance(p:get_pos(),self.home);if d<nearest then target=p;nearest=d end end
  if target then boss_cast(self,target);self.timer=self.hp<self.maxhp*.5 and 3.8 or 5 else self.timer=1 end
 end})
local population_timer=0
core.register_globalstep(function(dt)
 for i=#fields,1,-1 do local f=fields[i]
  if clock()>f.until_at then
   if f.kind=='singularity' then hurt_at(f.p,10,65,f.owner);ph.destroy_sphere(f.p,6);aura(f.p,10,f.colour,.7);ph.impact_fx(f.p,10,f.colour)end
   table.remove(fields,i)
  elseif clock()>=f.next then
   f.next=clock()+(f.kind=='nova' and .15 or .6)
   if f.kind=='nova' then
    local r=4+(clock()-f.start)*13;aura(f.p,r,f.colour,.2)
    for _,p in ipairs(core.get_connected_players())do local pos=p:get_pos();if math.abs(pos.y-f.p.y)<2 and math.abs(math.sqrt((pos.x-f.p.x)^2+(pos.z-f.p.z)^2)-r)<2.5 then ph.hurt(p,26,f.p)end end
   else
    local r=f.kind=='singularity' and 10 or f.kind=='lightning' and 9 or 5;aura(f.p,r,f.colour,.65)
    particle(f.p,'eq_orb.png^[multiply:'..f.colour,12,.65);ph.area_fx(f.p,r,f.colour,.55,true)
    hurt_at(f.p,r,f.kind=='lightning' and 18 or 9,f.owner,f.kind=='ice' and 2 or nil)
    if f.kind=='singularity' then for _,o in ipairs(core.get_objects_inside_radius(f.p,15))do if hostile(o)then o:add_velocity(vector.multiply(vector.direction(o:get_pos(),f.p),4))end end end
   end
  end
 end
 population_timer=population_timer+dt;if population_timer<1 then return end;population_timer=0
 local function near(pos,range)for _,p in ipairs(core.get_connected_players())do if vector.distance(pos,p:get_pos())<range then return true end end end
 for _,book in ipairs(encounters.books)do
  local obj=book_objects[book.id]
  local observers={};local needed=false
  for _,p in ipairs(core.get_connected_players())do local name=p:get_player_name();local g=ph.players[name]
   if g and not g.books[tostring(book.id)] then observers[name]=true;if vector.distance(p:get_pos(),book)<140 then needed=true end end
  end
  if needed then
   if not obj or not obj:get_pos()then obj=core.add_entity(offset(book,1.7),'ponyhaven:spellbook');if obj then obj:get_luaentity().book=book;obj:set_properties({textures={'wyrda_spell_book.png^[resize:32x32^wyrda_spell_'..book.name:lower()..'.png'},nametag=book.name..'  [ '..book.id..' ]',nametag_color='#f0d4ff'});book_objects[book.id]=obj end end
   if obj then obj:set_observers(observers)end
   aura(book,1.2,'#d7a5ff',1.1)
  elseif obj then obj:remove();book_objects[book.id]=nil end
 end
 for _,boss in ipairs(encounters.bosses)do
  local obj=boss_objects[boss.id];local alive=storage:get_int('boss:'..boss.id)<=os.time()
  if near(boss,180) and alive then
   if not obj or not obj:get_pos()then
    local sprite=ph.npc_sheets[boss.id];local height=math.min(2.3,sprite.height/60)*10;local center=height/2
    obj=core.add_entity(offset(boss,center),'ponyhaven:boss')
    if obj then local e=obj:get_luaentity();e.boss=boss;e.home=boss;e.center_height=center;e.radius=math.max(4,height*.35);e.hp=1200;e.maxhp=1200;e.sheet=sprite
     obj:set_properties({textures={sprite.texture},spritediv={x=1,y=sprite.frames},visual_size={x=sprite.width/sprite.height*height,y=height},selectionbox={-e.radius,-center,-e.radius,e.radius,center,e.radius},nametag=boss.name..'  1200 / 1200',nametag_color='#ffbdcf'})
     obj:set_sprite({x=0,y=0},sprite.frames,sprite.delay,false);boss_objects[boss.id]=obj;ph.health_bar(e,center+1.5,10)
    end
   end
  elseif obj then obj:remove();boss_objects[boss.id]=nil end
  for _,player in ipairs(core.get_connected_players())do local name=player:get_player_name();local g=ph.players[name];local key=name..':'..boss.id;local loot=loot_objects[key]
   if g and not alive and not g.bosses[boss.id] and vector.distance(player:get_pos(),boss)<130 then
    if not loot or not loot:get_pos()then local s=ph.npc_sheets[boss.id];loot=core.add_entity(offset(boss,2),'ponyhaven:boss_loot');if loot then loot:set_observers({[name]=true});loot:set_properties({textures={s.texture},spritediv={x=1,y=s.frames},visual_size={x=s.width/s.height*2,y=2},nametag=boss.name..' pet · E to collect',nametag_color='#ffe8a3'});loot:set_sprite({x=0,y=0},s.frames,s.delay,false);loot_objects[key]=loot end end
   elseif loot then loot:remove();loot_objects[key]=nil end
  end
 end
 for key,obj in pairs(loot_objects)do local name=key:match('^(.-):');if not ph.players[name]then obj:remove();loot_objects[key]=nil end end
end)
ph.boss_objects=boss_objects;ph.book_objects=book_objects;ph.spells=spells;ph.shoot=shoot;ph.cast=cast;ph.slash=slash;ph.boss_cast=boss_cast
