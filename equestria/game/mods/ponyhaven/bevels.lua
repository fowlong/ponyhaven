local ph=ponyhaven
-- Mild edge softening for the close-range destructible voxels. A solid cube or
-- leaf block whose top edge or outer corner faces open air is drawn the same with
-- small chamfers (see scripts/prepare-equestria-bevels.mjs). Collision and
-- selection stay full cubes, so structure and gameplay are unchanged; the choice
-- depends only on the six neighbours, so it is deterministic and re-evaluated
-- around craters. Distant scenery is built from the source map, never from here.
local enabled=core.settings:get_bool('ponyhaven_bevel',true)and not core.settings:get_bool('ponyhaven_smooth',false)
ph.bevel_enabled=enabled;ph.bevel_base={}
local closed,variants_of={},{}
local definition=assert(ph.read_json(ph.path..'/bevels.json'),'Missing bevel meshes')
for _,m in ipairs(ph.materials)do
 local id=ph.state_ids[m.id]
 -- Faces next to these are hidden, so the shared edge is not an outer edge.
 if m.solid and(m.shape=='cube'or m.shape=='leaves')then closed[id]=true end
 if enabled and m.solid and(m.shape=='cube'or m.shape=='leaves')then
  local set={};variants_of[id]=set;local leaves=m.shape=='leaves'
  for _,v in ipairs(definition.variants)do
   local name='ponyhaven:bevel_'..m.id..'_'..v.key
   -- Non-emissive cube variants do not transmit light, so roof edges cannot leak
   -- daylight into rooms; the launcher keeps smooth lighting on for meshes.
   -- Leaves keep their cut-out, see-through look and their original light flow.
   core.register_node(name,{description=m.base:gsub('_',' '),drawtype='mesh',mesh=v.mesh,
    tiles={{name=m.texture,backface_culling=not leaves}},use_texture_alpha=leaves and'clip'or'opaque',
    paramtype=(leaves or(m.light or 0)>0)and'light'or'none',sunlight_propagates=leaves,light_source=m.light or 0,
    walkable=true,pointable=true,diggable=false,buildable_to=false,drop='',is_ground_content=false,
    groups={not_in_creative_inventory=1},collision_box={type='fixed',fixed=m.boxes},selection_box={type='fixed',fixed=m.boxes}})
   local variant=core.get_content_id(name)
   set[v.top*16+v.sides]=variant;ph.bevel_base[variant]=id;closed[variant]=true
   ph.destructible[variant]=true;ph.solid_ids[variant]=true
  end
 end
end
-- Reclassify cubes in [minp,maxp]; the area must include a one-node margin.
-- Unloaded neighbours (ignore) count as closed, so nothing is bevelled blindly.
local ignore=core.get_content_id('ignore')
function ph.bevel_volume(data,area,minp,maxp)
 if not enabled then return end
 local ys,zs=area.ystride,area.zstride
 local side={1,zs,-1,-zs} -- +x, +z, -x, -z: the generator's bit order
 for z=minp.z,maxp.z do for y=minp.y,maxp.y do
  local at=area:index(minp.x,y,z)
  for _=minp.x,maxp.x do
   local id=data[at];local base=ph.bevel_base[id]or id;local set=variants_of[base]
   if set then
    local key=0
    for i=1,4 do local n=data[at+side[i]];if not closed[n]and n~=ignore then key=key+2^(i-1)end end
    local above=data[at+ys];if not closed[above]and above~=ignore then key=key+16 end
    data[at]=set[key]or base
   end
   at=at+1
  end
 end end
end
