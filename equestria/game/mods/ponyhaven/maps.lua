local ph=ponyhaven
local map=assert(ph.read_json(ph.path..'/map.json'))
local huds={}
local escape=core.formspec_escape
local function update_books(player,g,h)
 local info=core.get_player_window_information(player:get_player_name())
 local width=info and info.size.x/(info.real_hud_scaling or 1) or 1280
 local scale=math.min(1,math.max(.4,(width-24)/594))
 for i,spell in ipairs(ph.spells)do
  local owned=g.books[tostring(i)]==true;local state=g.equipped==i and owned and 'equipped' or owned and 'owned' or 'locked'
  local slot=h.books[i];local x=(i-4)*86*scale
  local colour=state=='equipped' and 0xffda8b or owned and 0xf1e7ff or 0x999fb5
  local function text(value,y,size,dx)
   return {type='text',position={x=.5,y=1},alignment={x=0,y=0},offset={x=x+(dx or 0)*scale,y=-66+y*scale},size={x=size*scale,y=0},number=colour,text=value,z_index=12}
  end
  local function image(texture,y,size)
   return {type='image',position={x=.5,y=1},alignment={x=0,y=0},offset={x=x,y=-66+y*scale},scale={x=size*scale,y=size*scale},text=texture,z_index=11}
  end
  if not slot or slot.state~=state or h.book_scale~=scale then
   local dim=owned and '' or '^[opacity:65'
   local defs={panel=image('eq_book_slot_'..state..'.png',-68,1),
    book=image('wyrda_spell_book.png'..dim,-80,2.5),
    sigil=image('wyrda_spell_'..spell:lower()..'.png'..dim,-80,.65),
    key=text(tostring(i),-108,.85,-26),title=text(spell,-48,.8),
    state=text(state=='equipped' and 'EQUIPPED' or owned and 'Unlocked' or 'Locked',-28,.65)}
   defs.panel.z_index=10;defs.sigil.z_index=12
   if not slot then slot={ids={}};h.books[i]=slot end
   for part,def in pairs(defs)do
    if slot.ids[part]then for field,value in pairs(def)do if field~='type'then player:hud_change(slot.ids[part],field,value)end end
    else slot.ids[part]=player:hud_add(def)end
   end
   slot.state=state
  end
 end
 h.book_scale=scale
end
function ph.update_book_hud(player)
 if not player then return end
 local name=player:get_player_name();local g=ph.players[name];local h=huds[name]
 if g and h then update_books(player,g,h)end
end
local function xy(p)return .5+(p.x-map.min.x)/(map.max.x-map.min.x)*12,.8+(map.max.z-p.z)/(map.max.z-map.min.z)*8.5 end
function ph.quest_target(g)
 if not g.quest then return end
 local q=g.quest;local step=q.steps[q.current]
 if not step then return end
 local npc=ph.locations.npcs[q.npc+1]
 if step.picked then
  return npc,'Return '..step.item..' to '..npc.name..' ('..q.current..'/'..q.total..')'
 else
  return step.target,'Find '..step.item..' for '..npc.name..' ('..q.current..'/'..q.total..')'
 end
end
function ph.map_form(player)
 local name=player:get_player_name();local g=ph.players[name];if not g then return end
 g.map_open=true
 local form='formspec_version[6]size[17,11]bgcolor[#211c35ee;true]label[.5,.35;EQUESTRIA · north is up]image[.5,.8;12,8.5;eq_worldmap.png]'
 local function marker(p,texture,label)
  local x,y=xy(p);form=form..'image['..(x-.12)..','..(y-.12)..';.24,.24;'..texture..']tooltip['..(x-.16)..','..(y-.16)..';.32,.32;'..escape(label)..']'
 end
 for i,t in ipairs(ph.locations.towns)do marker(t,'eq_marker.png',t.name);form=form..'button_exit[13,'..(1.3+i*.65)..';3.5,.55;town_'..i..';'..escape(t.name)..']'end
 for _,book in ipairs(ph.encounters.books)do if not g.books[tostring(book.id)]then marker(book,'eq_book_marker.png',book.id..' · '..book.name..' spellbook')end end
 for _,boss in ipairs(ph.encounters.bosses)do marker(boss,'eq_boss_marker.png',boss.name..(g.bosses[boss.id] and ' · pet collected' or ' · world boss'))end
 for _,npc in ipairs(ph.locations.npcs)do marker(npc,'eq_quest.png',npc.name..' · quest chain')end
 local target,objective=ph.quest_target(g)
 if target then marker(target,'eq_quest_done.png',objective)end
 marker(player:get_pos(),'eq_orb.png','You are here')
 form=form..'label[13,.9;Travel to a town]label[13,4.8;Gold: towns / deliveries]label[13,5.3;Purple: spellbooks]label[13,5.8;Pink: world bosses]label[13,6.3;Green: tracked quest]label[13,7.1;1–7: equip / put away book]label[13,7.6;Left / right mouse: attacks]label[13,8.1;E: interact · I: world map]textarea[13,8.65;3.5,1.1;;Tracked quest;'..escape(objective or 'Talk to a town pony with a gold ! to accept a delivery.')..']button_exit[13,9.9;3.5,.7;close;Keep exploring]label[.5,9.7;Hover over a marker for its name. Books stay in the same locations. Boss pets are collected at defeated arenas.]'
 core.show_formspec(name,'ponyhaven:travel',form)
end
core.register_on_joinplayer(function(player)
 local name=player:get_player_name()
 player:hud_set_flags({minimap=true,minimap_radar=false})
 player:set_minimap_modes({{type='surface',label='Equestria · nearby terrain',size=256},{type='surface',label='Equestria · wide view',size=512},{type='off'}},0)
 huds[name]={health=player:hud_add({type='image',position={x=.025,y=.105},alignment={x=1,y=0},scale={x=3,y=2},text='eq_health_20.png',z_index=9}),status=player:hud_add({type='text',position={x=.5,y=.96},alignment={x=0,y=0},number=0xffeed4,text='',size={x=1,y=0}}),
 boss=player:hud_add({type='text',position={x=.5,y=.12},alignment={x=0,y=0},number=0xffb7cd,text='',size={x=1,y=0}}),
 quest=player:hud_add({type='text',position={x=.025,y=.21},alignment={x=1,y=1},number=0xb9ffd3,text='',size={x=1,y=0}}),markers={},books={},hud_scale=1}
 ph.update_book_hud(player)
end)
core.register_on_leaveplayer(function(p)huds[p:get_player_name()]=nil end)
function ph.update_map_huds()
 for _,player in ipairs(core.get_connected_players())do
  local name=player:get_player_name();local g=ph.players[name];local h=huds[name]
  if g and h then
   update_books(player,g,h)
   -- Responsive HUD: derive scale from window width, same factor as the book bar.
   local info=core.get_player_window_information(name)
   local width=info and info.size.x/(info.real_hud_scaling or 1) or 1280
   local s=math.min(1,math.max(.4,(width-24)/594))
   if s~=h.hud_scale then
    h.hud_scale=s
    player:hud_change(h.health,'scale',{x=3*s,y=2*s})
    player:hud_change(h.status,'size',{x=s,y=0})
    player:hud_change(h.boss,'size',{x=s,y=0})
    player:hud_change(h.quest,'size',{x=s,y=0})
   end
   player:hud_change(h.health,'text','eq_health_'..math.max(0,math.min(20,math.ceil(g.hp/5)))..'.png')
   player:hud_change(h.status,'text','Health '..math.ceil(g.hp)..'/100   Magic '..math.floor(g.mana)..'/100   '..(g.equipped and ph.spells[g.equipped]..' · LMB primary / RMB secondary' or 'LMB aura combo / RMB rainbow orb')..'\n1–7 books · E interact · I world map · V minimap')
   local closest,range=nil,100
   for _,obj in pairs(ph.boss_objects)do local p=obj:get_pos();if p then local e=obj:get_luaentity();local d=vector.distance(player:get_pos(),e.home);if d<range then closest=e;range=d end end end
   player:hud_change(h.boss,'text',closest and closest.boss.name..'\n'..string.rep('█',math.ceil(closest.hp/closest.maxhp*24))..string.rep('░',24-math.ceil(closest.hp/closest.maxhp*24))..'  '..closest.hp..' / '..closest.maxhp or '')
   local desired={}
   local function track(key,p,text,texture,label)
    desired[key]=true
    local marker=h.markers[key]
    if not marker then marker={icon=player:hud_add({type='image_waypoint',world_pos=vector.offset(p,0,2.6,0),text=texture,scale={x=.6,y=.6},alignment={x=0,y=0},z_index=2})};h.markers[key]=marker
    else player:hud_change(marker.icon,'world_pos',vector.offset(p,0,2.6,0));player:hud_change(marker.icon,'text',texture)end
    if label then
     if not marker.label then marker.label=player:hud_add({type='waypoint',name=text,text=' m',precision=1,world_pos=vector.offset(p,0,2.6,0),offset={x=0,y=28},number=0xb9ffd3})
     else player:hud_change(marker.label,'world_pos',vector.offset(p,0,2.6,0));player:hud_change(marker.label,'name',text)end
    end
   end
   for _,npc in ipairs(ph.locations.npcs)do if vector.distance(player:get_pos(),npc)<110 then
    track('npc:'..npc.id,npc,npc.name,g.quest and g.quest.npc==npc.id and g.quest.picked and 'eq_quest_done.png' or 'eq_quest.png')
   end end
   local target,objective=ph.quest_target(g)
   if target then
    if vector.distance(player:get_pos(),target)<100 and (ph.seconds or 0)>(h.quest_fx or 0)then
     h.quest_fx=(ph.seconds or 0)+1
     core.add_particlespawner({amount=18,time=1,minpos=vector.offset(target,-.5,.1,-.5),maxpos=vector.offset(target,.5,1.3,.5),minvel={x=-.2,y=.3,z=-.2},maxvel={x=.2,y=1,z=.2},minexptime=.7,maxexptime=1.2,minsize=4,maxsize=7,glow=14,texture='eq_spark.png^[multiply:#39ff66',playername=name})
    end
    local step=g.quest.steps[g.quest.current]
    track('quest',target,step and step.picked and 'Return delivery' or 'Quest parcel','eq_quest_done.png',true)
    player:hud_change(h.quest,'text','TRACKED QUEST ('..g.quest.current..'/'..g.quest.total..')\n'..objective..'\n'..math.floor(vector.distance(player:get_pos(),target))..' m · Follow the neon green marker · E to '..(step and step.picked and 'deliver' or 'collect')..' · I for map')
   else player:hud_change(h.quest,'text','QUESTS · Talk to a town pony with a gold !\nE to interact · I for the world map')end
   for key,marker in pairs(h.markers)do if not desired[key]then player:hud_remove(marker.icon);if marker.label then player:hud_remove(marker.label)end;h.markers[key]=nil end end
  end
 end
end
ph.map_huds=huds
local timer=0
core.register_globalstep(function(dt)timer=timer+dt;if timer<.4 then return end;timer=0;ph.update_map_huds()end)
