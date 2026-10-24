local ph=ponyhaven
-- Friendship Emergencies, Elements of Harmony experience, speech bubbles,
-- dialogue choices and the quest journal. Scenario text lives in
-- friendship.json, which the Ponyhaven wiki is also generated from.
local data=assert(ph.read_json(ph.path..'/friendship.json'),'Missing friendship data')
ph.friendship=data
local elements,archetypes,scenarios={},{},{}
for _,e in ipairs(data.elements)do elements[e.id]=e end
for _,a in ipairs(data.archetypes)do archetypes[a.id]=a end
for _,s in ipairs(data.emergencies)do scenarios[s.id]=s end
local escape=core.formspec_escape
local function clock()return ph.seconds or 0 end
-- Seconds until the next emergency: first one, after resolving, after giving up.
local FIRST_DELAY=120
local function next_after_resolve()return math.random(180,360)end
local function next_after_give_up()return math.random(90,240)end
local function npc_by_id(id)for _,npc in ipairs(ph.locations.npcs)do if npc.id==id then return npc end end end
local function fill(text,e)
 return (text:gsub('{(%w+)}',function(key)
  if key=='A'then return npc_by_id(e.a).name elseif key=='B'then return npc_by_id(e.b).name elseif key=='town'then return e.town end
 end))
end
local function log(g,line)g.log=g.log or{};table.insert(g.log,1,line);g.log[13]=nil;g.journal_dirty=true end

-- Experience. Mirrors harmonyLevel() in src/equestria-state.ts: 300 XP for
-- level 2, then 150 more per level. Ponyhaven grants a very rare card per level.
function ph.harmony_level(xp)
 local level,need,left=1,300,math.max(0,math.floor(xp or 0))
 while left>=need do left=left-need;level=level+1;need=need+150 end
 return level,left,need
end
function ph.grant_harmony(name,element,amount)
 local g=ph.players[name];local e=elements[element];if not g or not e or amount<=0 then return end
 local before=ph.harmony_level(g.harmony[element])
 g.harmony[element]=(g.harmony[element]or 0)+amount
 local after=ph.harmony_level(g.harmony[element])
 log(g,'+'..amount..' '..e.name..' experience')
 if after>before then ph.notice(name,'Element of '..e.name..' reached level '..after..'! A very rare card joins your collection.')end
end
ph.quest_theme_elements=data.questThemes

-- Speech bubbles: a per-player nametag above the speaking pony. Lines queue and
-- advance on a reading timer; each line is also kept in the journal.
core.register_entity('ponyhaven:bubble',{initial_properties={physical=false,visual='sprite',textures={'eq_blank.png'},visual_size={x=.01,y=.01},
 pointable=false,static_save=false,nametag='',nametag_color='#3b2546',nametag_bgcolor='#fff7eef2'}})
local talks={}
local function wrap(text,width)
 local out,line={},''
 for word in text:gmatch('%S+')do
  if #line>0 and #line+#word+1>width then out[#out+1]=line;line=word else line=#line>0 and line..' '..word or word end
 end
 if #line>0 then out[#out+1]=line end
 return table.concat(out,'\n')
end
local function bubble_at(npc)local p=ph.npc_position(npc);return vector.offset(p,0,(ph.npc_height and ph.npc_height(npc)or 2)+.55,0)end
function ph.say(name,npc,lines,done)
 local talk=talks[name];if talk and talk.obj then talk.obj:remove()end
 local g=ph.players[name];if g then g.talking_to=npc.id end
 talks[name]={npc=npc,lines=lines,index=0,next=0,done=done}
end
function ph.talking(name)return talks[name]~=nil end
-- E during a conversation shows the next line straight away.
function ph.advance_talk(name)local talk=talks[name];if talk then talk.next=0 end;return talk~=nil end
local function step_talks()
 for name,talk in pairs(talks)do
  local player=core.get_player_by_name(name);local g=ph.players[name]
  if not player or not g then if talk.obj then talk.obj:remove()end;talks[name]=nil
  elseif clock()>=talk.next then
   talk.index=talk.index+1;local line=talk.lines[talk.index]
   if talk.obj then talk.obj:remove();talk.obj=nil end
   if line then
    local obj=core.add_entity(bubble_at(talk.npc),'ponyhaven:bubble')
    if obj then obj:set_observers({[name]=true});obj:set_properties({nametag=wrap(line,34)});talk.obj=obj end
    log(g,talk.npc.name..': '..line)
    talk.next=clock()+math.max(2.6,#line/15)
   else
    talks[name]=nil;g.talking_to=nil;if talk.done then talk.done()end
   end
  elseif talk.obj and talk.obj:get_pos()then talk.obj:set_pos(bubble_at(talk.npc))end
 end
end

-- Choices: a small panel with one button per answer, tinted by its Element.
local asking={}
function ph.ask(name,title,prompt,options,callback)
 asking[name]={options=options,callback=callback}
 local form='formspec_version[6]size[11,'..(3.6+#options*1.05)..']bgcolor[#211c35ee;true]label[.5,.6;'..escape(title)..']textarea[.5,1;10,1.9;;;'..escape(prompt)..']'
 for i,o in ipairs(options)do
  local e=elements[o.element];local y=3.1+(i-1)*1.05
  form=form..'style[choice_'..i..';bgcolor='..e.colour..';textcolor=#24172f]button[.5,'..y..';10,.9;choice_'..i..';'..escape(o.text..'  ·  '..e.name)..']'
 end
 core.show_formspec(name,'ponyhaven:choice',form)
end
-- Giving up asks first; a fresh emergency follows after a short random wait.
core.register_on_player_receive_fields(function(player,formname,fields)
 local name=player:get_player_name();local g=ph.players[name]
 if formname==''and fields.give_up and g and g.emergency then
  core.show_formspec(name,'ponyhaven:give_up','formspec_version[6]size[9,3.4]bgcolor[#211c35ee;true]label[.5,.6;Give up on '..escape(scenarios[g.emergency.id].title)..'?]label[.5,1.2;Another pony will need your help soon.]button_exit[.5,2.1;3.8,.8;confirm;Give up]button_exit[4.7,2.1;3.8,.8;cancel;Keep helping]')
  return true
 end
 if formname=='ponyhaven:give_up'then
  if fields.confirm and g and g.emergency then
   log(g,'Gave up: '..scenarios[g.emergency.id].title);g.last_emergency=g.emergency.id;g.emergency=nil
   g.emergency_next=clock()+next_after_give_up();ph.persist(name);ph.notice(name,'Friendship Emergency abandoned. Another pony will need you soon.')
  end
  return true
 end
 if formname~='ponyhaven:choice'then return end
 local pending=asking[name];if not pending then return true end
 for i in ipairs(pending.options)do if fields['choice_'..i]then asking[name]=nil;core.close_formspec(name,'ponyhaven:choice');pending.callback(i);return true end end
 if fields.quit then asking[name]=nil end
 return true
end)

-- Friendship Emergencies ---------------------------------------------------
-- One priority emergency per player at a time, generated deterministically from
-- the save (uid and how many emergencies it has finished). Stages:
-- alert (hear the troubled pony) -> listen (hear the other side) -> clues ->
-- decide (the twist and a choice) -> done.
local function nearest_town(p)
 local best,d=ph.locations.towns[1],math.huge
 for _,t in ipairs(ph.locations.towns)do local x=vector.distance(p,t);if x<d then best,d=t,x end end
 return best.name
end
local function start_emergency(player,g)
 local p=player:get_pos();local seed=ph.hash(g.uid..':fe:'..g.fe_count)
 local sorted={};for _,npc in ipairs(ph.locations.npcs)do sorted[#sorted+1]=npc end
 table.sort(sorted,function(x,y)local dx,dy=vector.distance(p,x),vector.distance(p,y);if dx==dy then return x.id<y.id end;return dx<dy end)
 local a=sorted[seed%math.min(4,#sorted)+1]
 local b,best=nil,math.huge
 for _,npc in ipairs(ph.locations.npcs)do if npc.id~=a.id then local d=vector.distance(a,npc);if d<best then b,best=npc,d end end end
 local index=math.floor(seed/7)%#data.emergencies+1
 if data.emergencies[index].id==g.last_emergency then index=index%#data.emergencies+1 end
 local s=data.emergencies[index]
 -- Clues rest at two of the troubled pony's own quest spots.
 local first=math.floor(seed/13)%#a.targets+1;local second=(first+math.floor(seed/17)%(#a.targets-1))%#a.targets+1
 local e={id=s.id,a=a.id,b=b.id,town=nearest_town(a),stage='alert',clues={}}
 for i,spot in ipairs({a.targets[first],a.targets[second]})do e.clues[i]={x=spot.x,y=spot.y,z=spot.z,name=fill(s.clues[i],e),found=false}end
 g.emergency=e;g.journal_dirty=true;ph.persist(player:get_player_name())
 ph.notice(player:get_player_name(),'FRIENDSHIP EMERGENCY! '..s.title..': '..fill(s.event,e)..' Follow the big heart.')
 if ph.sound then ph.sound('spell',p,.5,1.2)end
end
local function finish_emergency(name,g,choice)
 local e=g.emergency;local s=scenarios[e.id];local o=s.choices[choice];local a=npc_by_id(e.a)
 ph.grant_harmony(name,s.elements[1],40);ph.grant_harmony(name,s.elements[2],20)
 ph.grant_harmony(name,o.element,o.best and 30 or 15)
 g.quests=g.quests+2 -- two deliveries' worth of bits for Ponyhaven
 g.fe_count=g.fe_count+1;g.last_emergency=e.id;g.emergency=nil;g.emergency_next=clock()+next_after_resolve()
 log(g,'Resolved: '..s.title..(o.best and ' (a heartfelt resolution)' or ''))
 ph.persist(name);ph.sync(name)
 local lines={fill(o.outcome,e)};for _,l in ipairs(s.resolve)do lines[#lines+1]=fill(l,e)end
 ph.say(name,a,lines)
 ph.notice(name,'Friendship Emergency resolved: '..s.title..'. +300 bits and Elements of Harmony experience.')
end
-- Where the big marker points, and the HUD line for it.
function ph.emergency_target(g)
 local e=g.emergency;if not e then return end
 local s=scenarios[e.id];local a,b=npc_by_id(e.a),npc_by_id(e.b)
 if e.stage=='alert'then return ph.npc_position(a),'Hear '..a.name..' out',s
 elseif e.stage=='listen'then return ph.npc_position(b),'Hear '..b.name..'\'s side of the story',s
 elseif e.stage=='clues'then for _,c in ipairs(e.clues)do if not c.found then return c,'Find the '..c.name,s end end
 elseif e.stage=='decide'then return ph.npc_position(a),'Help '..a.name..' and '..b.name..' make things right',s end
end
-- E near an emergency pony or clue. Returns true when it handled the press.
function ph.friendship_interact(player)
 local name=player:get_player_name();local g=ph.players[name];local e=g and g.emergency
 if ph.advance_talk(name)then return true end
 if not e then return false end
 local s=scenarios[e.id];local p=player:get_pos();local a,b=npc_by_id(e.a),npc_by_id(e.b)
 if e.stage=='clues'then
  for _,c in ipairs(e.clues)do if not c.found and vector.distance(p,c)<3 then
   c.found=true;log(g,'Found the '..c.name..'.');g.journal_dirty=true
   local left=0;for _,other in ipairs(e.clues)do if not other.found then left=left+1 end end
   if left==0 then e.stage='decide';ph.notice(name,fill(s.twist,e)..' Return to '..a.name..'.')
   else ph.notice(name,'Found the '..c.name..'. One more clue to find.')end
   ph.persist(name);return true
  end end
 end
 local near=function(npc)return vector.distance(p,ph.npc_position(npc))<3.5 end
 if near(a)then
  if e.stage=='alert'then ph.say(name,a,{fill(s.open[1],e),fill(s.open[2],e)},function()e.stage='listen';g.journal_dirty=true;ph.persist(name)end)
  elseif e.stage=='decide'then
   ph.say(name,a,{fill(s.twist,e)},function()
    local options={};for i,c in ipairs(s.choices)do options[i]={text=fill(c.text,e),element=c.element}end
    ph.ask(name,'Friendship Emergency · '..s.title,fill(s.event,e)..'\n\n'..fill(s.twist,e)..'\n\nWhat do you suggest?',options,function(i)
     if ph.players[name]==g and g.emergency==e then finish_emergency(name,g,i)end
    end)
   end)
  else ph.say(name,a,{e.stage=='listen'and('Please talk to '..b.name..'.')or('Did you find anything? Look for the '..(e.clues[1].found and e.clues[2].name or e.clues[1].name)..'.')})end
  return true
 end
 if near(b)then
  if e.stage=='listen'then ph.say(name,b,{fill(s.other[1],e),fill(s.other[2],e)},function()e.stage='clues';g.journal_dirty=true;ph.persist(name);ph.notice(name,'Look around for clues. Follow the heart.')end)
  else ph.say(name,b,{e.stage=='alert'and('Have you spoken to '..a.name..'?')or'Thank you for helping.'})end
  return true
 end
 return false
end

-- Clue sparkles, visible only to the player who owns the emergency.
core.register_entity('ponyhaven:clue',{initial_properties={physical=false,visual='sprite',textures={'eq_emergency.png'},visual_size={x=.7,y=.7},pointable=false,static_save=false,glow=10}})
local clue_objects={} -- [player name] = {clue entities}; kept here so leaving always cleans up
local function step_clues(player,g)
 local objects=clue_objects[player:get_player_name()]or{};clue_objects[player:get_player_name()]=objects
 local e=g.emergency;local p=player:get_pos()
 for i=1,2 do
  local c=e and e.stage=='clues'and e.clues[i];local obj=objects[i]
  if c and not c.found and vector.distance(p,c)<100 then
   if not obj or not obj:get_pos()then obj=core.add_entity(vector.offset(c,0,.9,0),'ponyhaven:clue');if obj then obj:set_observers({[player:get_player_name()]=true})end;objects[i]=obj end
  elseif obj then obj:remove();objects[i]=nil end
 end
end

-- Quest journal: the inventory key (Tab) opens it.
local function bar(x,y,w,frac,colour)return 'box['..x..','..y..';'..w..',.32;#00000066]box['..x..','..y..';'..math.max(.02,w*frac)..',.32;'..colour..']'end
local function journal(player,g)
 -- Text keeps its pixel size when Luanti shrinks a formspec to fit a small
 -- window, so rows are spaced generously and text is a little smaller.
 local form='formspec_version[6]size[16,11]bgcolor[#211c35ee;true]style_type[label,textarea,button;font_size=*0.85]label[.5,.55;QUEST JOURNAL · '..escape(g.display)..']'
 local e=g.emergency;local s=e and scenarios[e.id]
 local lines={}
 if s then
  local _,objective=ph.emergency_target(g)
  lines[#lines+1]='FRIENDSHIP EMERGENCY · '..s.title
  lines[#lines+1]=fill(s.event,e)
  lines[#lines+1]='Next: '..(objective or '')
  lines[#lines+1]=archetypes[s.archetype].name..' · '..elements[s.elements[1]].name..' and '..elements[s.elements[2]].name
  lines[#lines+1]=''
 else lines[#lines+1]='No Friendship Emergency right now. A pony will need you soon.';lines[#lines+1]=''end
 local _,quest=ph.quest_target(g)
 lines[#lines+1]=quest and('DELIVERY · '..quest)or'DELIVERIES · Talk to a town pony with a gold ! for a quest chain.'
 lines[#lines+1]='';lines[#lines+1]='Friendship Emergencies resolved: '..g.fe_count
 form=form..'textarea[.5,1.1;8.6,4.4;;Quests;'..escape(table.concat(lines,'\n'))..']'
 form=form..'textarea[.5,6.1;8.6,3.6;;Recent conversations;'..escape(table.concat(g.log or{},'\n'))..']'
 form=form..'label[9.6,1.1;ELEMENTS OF HARMONY]'
 for i,el in ipairs(data.elements)do
  local level,into,need=ph.harmony_level(g.harmony[el.id]or 0)
  local y=1.75+(i-1)*1.25
  form=form..'label[9.6,'..y..';'..escape(el.name..' · level '..level..' · '..into..' / '..need)..']'..bar(9.6,y+.35,5.9,into/need,el.colour)
 end
 form=form..'label[9.6,9.4;A new level earns a very rare card.]'
 if s then form=form..'style[give_up;bgcolor=#5a3d5c]button[.5,10;4.4,.7;give_up;Give up emergency]'end
 player:set_inventory_formspec(form)
end

local tick=0
core.register_globalstep(function(dt)
 step_talks()
 tick=tick+dt;if tick<.5 then return end;tick=0
 for _,player in ipairs(core.get_connected_players())do
  local name=player:get_player_name();local g=ph.players[name]
  if g then
   g.emergency_next=g.emergency_next or clock()+FIRST_DELAY
   if not g.emergency and not g.travel and clock()>=g.emergency_next then start_emergency(player,g)end
   step_clues(player,g)
   if g.journal_dirty then g.journal_dirty=false;journal(player,g)end
  end
 end
end)
core.register_on_leaveplayer(function(player)
 local name=player:get_player_name();local talk=talks[name];if talk and talk.obj then talk.obj:remove()end;talks[name]=nil;asking[name]=nil
 for _,obj in pairs(clue_objects[name]or{})do obj:remove()end;clue_objects[name]=nil
end)
