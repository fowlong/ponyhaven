local ph=ponyhaven
local air=core.get_content_id('air')
function ph.smooth_volume(data,area,minp,maxp,param2)
 assert(param2,'Surface smoothing requires original-material storage')
 local original={};for i,id in ipairs(data)do original[i]=ph.original_content(id,param2[i]) end
 local offsets={0,1,area.ystride,area.ystride+1,area.zstride,area.zstride+1,area.zstride+area.ystride,area.zstride+area.ystride+1}
 for z=minp.z,maxp.z do for y=minp.y,maxp.y do for x=minp.x,maxp.x do
  local at=area:index(x,y,z);local id=original[at]
  if id==air or ph.natural[id] then
   data[at]=id;param2[at]=0
   local mask=0
   for i=1,8 do local other=original[at+offsets[i]];local natural=ph.natural[other]
    if natural then mask=mask+2^(i-1)
    elseif ph.solid_ids[other] then mask=mask+2^(i-1)end
   end
   if mask>0 and mask<255 then
    -- Choose the material behind the surface, rather than the first neighbour.
    -- Store the original anchor separately so remeshing never changes colours.
    local base
    for _,corner in ipairs(ph.surface_candidates[mask])do base=ph.natural[original[at+offsets[corner+1]]];if base then break end end
    if base then data[at]=ph.smooth_ids[base][mask];param2[at]=ph.anchor_index[id] or 255 end
   end
  end
 end end end
end
local upgrades={}
core.register_lbm({name='ponyhaven:surface_material_ownership',nodenames={'group:ponyhaven_surface'},run_at_every_load=true,
 action=function(pos,node)
  if not core.settings:get_bool('ponyhaven_smooth',false)then return end
  if node.param2~=0 then return end
  local minp={x=math.floor(pos.x/16)*16,y=math.floor(pos.y/16)*16,z=math.floor(pos.z/16)*16};local key=core.hash_node_position(minp)
  if upgrades[key]then return end;upgrades[key]=true
  core.after(0,function()
   upgrades[key]=nil;local maxp=vector.offset(minp,15,15,15)
   local vm=VoxelManip();local emin,emax=vm:read_from_map(vector.offset(minp,-1,-1,-1),vector.offset(maxp,1,1,1))
   local area=VoxelArea:new({MinEdge=emin,MaxEdge=emax});local data,param2=vm:get_data(),vm:get_param2_data()
   ph.smooth_volume(data,area,minp,maxp,param2);vm:set_data(data);vm:set_param2_data(param2);vm:write_to_map(true);vm:close()
  end)
 end})
