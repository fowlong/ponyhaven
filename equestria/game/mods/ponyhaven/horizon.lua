local ph=ponyhaven
local origin={x=0,y=0,z=0};local anchor
local modpath=core.get_modpath('ponyhaven')
local file=assert(io.open(modpath..'/horizon.json','r'));local definition=assert(core.parse_json(file:read('*a')));file:close()
assert(definition.version==4,'The bundled scenery tiers are missing')
local tiles,clients,lookup,meshes={},{},{},{};ph.horizon_tiles=tiles;ph.horizon_clients=clients
ph.horizon_selection={};ph.horizon_metrics={requests=0,media_us=0}
for _,tile in ipairs(definition.tiles)do
 local high={id=tile.id..':2',mesh=tile.mesh,sha1=tile.sha1,triangles=tile.triangles}
 local low={id=tile.id..':4',mesh=tile.low.mesh,sha1=tile.low.sha1,triangles=tile.low.triangles}
 tile.high=high;tile.low=low;meshes[high.id]=high;meshes[low.id]=low
 lookup[math.floor((tile.min.x+.5)/128)..','..math.floor((tile.min.z-.5)/128)]=tile
end
local media={};local cache=core.get_mod_data_path()..'/s-'..(core.settings:get('ponyhaven_session')or'local'):sub(1,8);assert(core.mkdir(cache))
local function media_path(tile)
 if media[tile.id]then return media[tile.id]end
 local source=assert(io.open(modpath..'/scenery/'..tile.mesh..'.deflate','rb'))
 local data=assert(core.decompress(source:read('*a'),'deflate'));source:close()
 local target=cache..'/'..tile.mesh;assert(core.safe_file_write(target,data));media[tile.id]=target;return target
end
core.register_entity('ponyhaven:scenery_anchor',{initial_properties={visual='sprite',textures={'eq_blank.png'},physical=false,pointable=false,static_save=false,is_visible=false}})
-- Dense tiles are split into OBJ groups (16-bit index limit); each group is
-- its own mesh buffer and needs its own texture entry.
local textures={};for i=1,definition.meshGroups or 1 do textures[i]='eq_horizon.png'end
core.register_entity('ponyhaven:distance',{initial_properties={visual='mesh',textures=textures,
 physical=false,pointable=false,collide_with_objects=false,static_save=false,collisionbox={0,0,0,0,0,0},selectionbox={0,0,0,0,0,0},
 backface_culling=true,shaded=false,glow=-1,visual_size={x=1,y=1,z=1}},
 on_activate=function(self,mesh)self.object:set_properties({mesh=mesh})end})
local destinations={}
function ph.prepare_scenery(name,target)destinations[name]=vector.new(target)end
local elapsed=1;local turn=0
core.register_globalstep(function(dt)
 elapsed=elapsed+dt;if elapsed<.15 or not anchor then return end;elapsed=0
 local players=core.get_connected_players();local wanted,queues={},{}
 for _,p in ipairs(players)do
  local name=p:get_player_name();local client=clients[name];local actual=p:get_pos();local pos=destinations[name]or actual
  if destinations[name]and vector.distance(actual,pos)<8 then destinations[name]=nil end
  if client then
   -- PLAYERPOS carries the live viewing range. The launcher observes it for
   -- every peer without changing native packets, including settings changes.
   local range=math.max(32,math.min(1024,(ph.view_ranges or {})[name]or 512))
   local outer=math.min(1024,range+math.max(128,math.min(256,range*.5)))
   local detail=math.min(256,math.max(64,range*.5));local prefetch=outer+128
   local bx,bz=math.floor((pos.x+.5)/128),math.floor((pos.z-.5)/128);local r=math.ceil(prefetch/128)+1
   local queue={};queues[name]=queue;local count,triangles=0,0
   -- Spatial lookup visits just the local ring, never all 6,860 world tiles.
   for z=bz-r,bz+r do for x=bx-r,bx+r do
    local tile=lookup[x..','..z]
    if tile then
     local dx=math.max(tile.min.x-pos.x,0,pos.x-tile.max.x);local dz=math.max(tile.min.z-pos.z,0,pos.z-tile.max.z);local distance=dx*dx+dz*dz
     if distance<prefetch*prefetch then
      local desired=distance<detail*detail and tile.high or tile.low;local alternate=desired==tile.high and tile.low or tile.high
      count=count+1;triangles=triangles+desired.triangles
      local visible=client.ready[desired.id]and desired or client.ready[alternate.id]and alternate
      -- Luanti limits entity delivery by its origin, regardless of mesh bounds.
      -- Each observer gets nearby network anchors; the shader cancels their
      -- translation so geometry stays fixed while walking and teleporting.
      if visible then wanted[name..'|'..visible.id]={name=name,mesh=visible,pos=actual}end
      if not client.ready[desired.id]and not client.pending[desired.id]then queue[#queue+1]={tile=desired,distance=distance}end
     end
    end
   end end
   table.sort(queue,function(a,b)return a.distance<b.distance end)
   ph.horizon_selection[name]={range=range,outer=outer,detail=detail,tiles=count,triangles=triangles}
  end
 end
 -- Avoid bursts of synchronous OBJ loading on the client and decompression on
 -- the server. Round-robin scheduling keeps joining friends from being starved.
 local work=core.get_us_time();local sent=0
 for offset=1,#players*2 do
  local p=players[(turn+offset-1)%#players+1];local name=p:get_player_name();local client=clients[name];local queue=queues[name]
  if client and client.active<2 and queue and #queue>0 then
   local tile=table.remove(queue,1).tile;local id=tile.id;client.pending[id]=true;client.active=client.active+1
   local ok=core.dynamic_add_media({filename=tile.mesh,filepath=media_path(tile),to_player=name,client_cache=true},function(who)
    if clients[who]==client then client.ready[id]=true;client.pending[id]=nil;client.active=client.active-1 end
   end)
   if not ok then client.pending[id]=nil;client.active=client.active-1 end
   sent=sent+1;if sent>=2 or core.get_us_time()-work>3000 then break end
  end
 end
 turn=turn+1;ph.horizon_metrics.requests=ph.horizon_metrics.requests+sent;ph.horizon_metrics.media_us=ph.horizon_metrics.media_us+core.get_us_time()-work
 for id,view in pairs(wanted)do
  local obj=tiles[id]
  if not obj or not obj:get_pos()then
   obj=core.add_entity(view.pos,'ponyhaven:distance',view.mesh.mesh);tiles[id]=obj
   if obj then obj:get_luaentity().tile_id=view.mesh.id;obj:set_observers({[view.name]=true})end
  elseif vector.distance(obj:get_pos(),view.pos)>4 then obj:set_pos(view.pos)end
 end
 for id,obj in pairs(tiles)do if not wanted[id]then obj:remove();tiles[id]=nil end end
end)
core.register_on_joinplayer(function(player)
 clients[player:get_player_name()]={ready={},pending={},active=0}
 player:set_sky({sky_color={day_sky='#bedcf2',day_horizon='#cbdff2',dawn_sky='#c6c9eb',dawn_horizon='#dfd9ee'},fog={fog_distance=1024,fog_start=.8,fog_color='#bfd8ee'}})
end)
core.register_on_leaveplayer(function(player)local name=player:get_player_name();clients[name]=nil;destinations[name]=nil;ph.horizon_selection[name]=nil end)
core.after(0,function()
 assert(core.forceload_block(origin,true),'Could not keep the scenery anchor active')
 core.emerge_area(origin,origin,function(_,_,remaining)if remaining==0 then anchor=core.add_entity(origin,'ponyhaven:scenery_anchor');ph.horizon_object=anchor end end)
end)
core.register_on_shutdown(function()
 core.forceload_free_block(origin,true);for _,filename in pairs(media)do os.remove(filename)end;os.remove(cache)
end)
