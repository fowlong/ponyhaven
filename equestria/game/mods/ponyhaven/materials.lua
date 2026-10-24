local ph=ponyhaven
ph.state_ids={};ph.natural={};ph.smooth_ids={};ph.surface_original={};ph.destructible={}
ph.anchor_index={};ph.anchor_ids={};ph.surface_masks={};ph.surface_candidates={}
local bases={}
local base_index={};local anchor_count=0
ph.use_nodes={}
for _,m in ipairs(ph.materials) do
 if m.id==0 then ph.state_ids[0]=core.get_content_id('air')
 else
  local def={description=m.base:gsub('_',' '),tiles={m.texture},paramtype='light',sunlight_propagates=m.shape~='cube',walkable=m.solid,
   pointable=m.solid,diggable=false,buildable_to=false,groups={},light_source=m.light or 0,drop='',is_ground_content=false,
   collision_box={type='fixed',fixed=m.boxes},climbable=m.climbable or false}
  if m.shape=='air' then def.drawtype='airlike'
  elseif m.shape=='box' or m.shape=='glassbox' then def.drawtype='nodebox';def.node_box={type='fixed',fixed=m.boxes};if m.shape=='glassbox' then def.use_texture_alpha='blend' end
  elseif m.shape=='plant' then def.drawtype='plantlike';def.use_texture_alpha='clip';def.visual_scale=1;def.waving=1
  elseif m.shape=='glass' then def.drawtype='glasslike';def.use_texture_alpha='blend'
  elseif m.shape=='leaves' then def.drawtype='allfaces_optional';def.use_texture_alpha='clip'
  elseif m.shape=='liquid' then
   def.drawtype='liquid';def.use_texture_alpha='blend';def.liquidtype='source';def.liquid_alternative_source=m.name;def.liquid_alternative_flowing=m.name
   def.liquid_viscosity=1;def.liquid_range=0;def.liquid_renewable=false;def.liquid_move_physics=true;def.drowning=0;def.post_effect_color={a=45,r=m.colour[1],g=m.colour[2],b=m.colour[3]}
  end
  if m.door then
   def.pointable=true
   ph.use_nodes[m.name]=function(pos,node)
    if m.toggle then core.swap_node(pos,{name='ponyhaven:m'..m.toggle}) end
    if m.base:match('_door$') then
     for _,dy in ipairs({-1,1}) do local other={x=pos.x,y=pos.y+dy,z=pos.z};local n=core.get_node(other)
      local id=tonumber(n.name:match('^ponyhaven:m(%d+)$'));local material=id and ph.materials[id+1]
      if material and material.base==m.base and material.toggle then core.swap_node(other,{name='ponyhaven:m'..material.toggle}) end
     end
    end
   end
  end
  core.register_node(m.name,def)
  local id=core.get_content_id(m.name);ph.state_ids[m.id]=id
  if m.shape~='liquid' and m.shape~='air' then ph.destructible[id]=true end
  if m.smooth then
   ph.natural[id]=m.base;bases[m.base]=m
   if not base_index[m.base]then anchor_count=anchor_count+1;assert(anchor_count<255,'Surface material palette is full');base_index[m.base]=anchor_count end
   ph.anchor_index[id]=base_index[m.base];ph.anchor_ids[base_index[m.base]]=id
  end
 end
end
local variants=core.settings:get_bool('ponyhaven_smooth',false)and assert(ph.read_json(ph.path..'/surfaces.json'))or{}
for _,v in ipairs(variants)do ph.surface_candidates[v.mask]=v.materialCandidates end
for base,m in pairs(bases) do
 ph.smooth_ids[base]={}
 for _,v in ipairs(variants) do
  local name='ponyhaven:surface_'..base..'_'..v.mask
  core.register_node(name,{description=base:gsub('_',' '),drawtype='mesh',mesh=v.mesh,tiles={m.texture},paramtype='light',sunlight_propagates=true,
   walkable=#v.boxes>0,pointable=true,diggable=false,drop='',is_ground_content=false,light_source=m.light or 0,groups={ponyhaven_surface=1},
   use_texture_alpha=m.shape=='glass' and 'blend' or m.shape=='leaves' and 'clip' or 'opaque',
   collision_box={type='fixed',fixed=v.boxes},selection_box={type='fixed',fixed=v.boxes}})
  local id=core.get_content_id(name);ph.smooth_ids[base][v.mask]=id
  ph.surface_masks[id]=v.mask
  ph.surface_original[id]=v.mask%2==1 and ph.state_ids[m.id] or core.get_content_id('air')
 end
end
function ph.original_content(id,param2)
 if not ph.surface_masks[id]then return id end
 if param2 and param2>0 then return ph.anchor_ids[param2] or core.get_content_id('air')end
 -- Legacy maps stored the anchor material in the node name; preserve their
 -- destructed terrain when upgrading, instead of regenerating the whole map.
 return ph.surface_original[id]
end
core.register_alias('mapgen_stone','air')
core.register_alias('mapgen_water_source','air')
core.register_alias('mapgen_river_water_source','air')
core.register_on_placenode(function(pos)core.remove_node(pos)end)
