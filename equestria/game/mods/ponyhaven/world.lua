local ph=ponyhaven
local imported=ph.world..'/imported'
ph.world_info=assert(ph.read_json(imported..'/world.json'),'Import the Equestria world first.')
local files,order={},{}
local air=core.get_content_id('air')
local ignore=core.get_content_id('ignore')
local function u16(s,p)local a,b=s:byte(p,p+1);return a+b*256 end
local function u32(s,p)local a,b,c,d=s:byte(p,p+3);return a+b*256+c*65536+d*16777216 end
local function region(rx,rz)
 local key=rx..','..rz
 if files[key]~=nil then return files[key] end
 local f=io.open(imported..'/regions/r.'..rx..'.'..rz..'.eqr','rb')
 if not f then return false end
 local head=f:read(32);assert(head and head:sub(1,4)=='EQR1','Invalid Equestria region')
 local lo,hi=u16(head,5),u16(head,7);if lo>=32768 then lo=lo-65536 end;if hi>=32768 then hi=hi-65536 end
 local r={file=f,lo=lo,hi=hi,index=f:read(1024*(hi-lo+1)*8)}
 files[key]=r;order[#order+1]=key
 if #order>12 then local old=table.remove(order,1);files[old].file:close();files[old]=nil end
 return r
end
local section_cache,section_order={},{}
local function section(cx,cy,cz)
 local key=cx..','..cy..','..cz
 if section_cache[key]~=nil then return section_cache[key] end
 local r=region(math.floor(cx/32),math.floor(cz/32));if not r or cy<r.lo or cy>r.hi then return air end
 local at=((cz%32*32+cx%32)*(r.hi-r.lo+1)+cy-r.lo)*8+1
 local offset,length=u32(r.index,at),u32(r.index,at+4)
 if length==0 then return ph.state_ids[offset] or error('Unknown uniform Equestria material') end
 assert(length<=16384 and offset>=32+#r.index,'Invalid Equestria section index')
 r.file:seek('set',offset);local raw=core.decompress(r.file:read(length),'deflate')
 assert(raw and #raw==8192,'Corrupt Equestria section')
 section_cache[key]=raw;section_order[#section_order+1]=key
 if #section_order>512 then section_cache[table.remove(section_order,1)]=nil end
 return raw
end
function ph.source_node(x,y,z)
 local cx,cy,cz=math.floor(x/16),math.floor(y/16),math.floor(-z/16)
 local s=section(cx,cy,cz);if type(s)=='number' then return s end
 return ph.state_ids[u16(s,((y%16)*256+(-z%16)*16+x%16)*2+1)]
end
local solid={}
for _,m in ipairs(ph.materials)do solid[ph.state_ids[m.id]]=m.solid end
ph.solid_ids=solid
ph.source_solid=function(x,y,z)return solid[ph.source_node(x,y,z)] or false end
core.set_mapgen_setting('mg_name','singlenode',true)
core.register_on_generated(function(minp,maxp)
 local vm,emin,emax=core.get_mapgen_object('voxelmanip');local area=VoxelArea:new({MinEdge=emin,MaxEdge=emax});local data,param2=vm:get_data(),vm:get_param2_data()
 -- Populate the emerged margin too, so terrain corners agree at generation boundaries.
 for cx=math.floor(emin.x/16),math.floor(emax.x/16) do
  for cz=math.floor(-emax.z/16),math.floor(-emin.z/16) do
   for cy=math.floor(emin.y/16),math.floor(emax.y/16) do
    local src,x0,y0,z0=section(cx,cy,cz),cx*16,cy*16,-cz*16
    for ly=0,15 do local y=y0+ly;if y>=emin.y and y<=emax.y then
     for lz=0,15 do local z=z0-lz;if z>=emin.z and z<=emax.z then
      local at,offset=area:index(x0,y,z),(ly*256+lz*16)*2+1
      for lx=0,15 do local x=x0+lx;if x>=emin.x and x<=emax.x and (data[at+lx]==ignore or (x>=minp.x and x<=maxp.x and y>=minp.y and y<=maxp.y and z>=minp.z and z<=maxp.z)) then data[at+lx]=type(src)=='number' and src or ph.state_ids[u16(src,offset+lx*2)];param2[at+lx]=0 end end
     end end
    end end
   end
  end
 end
 if core.settings:get_bool('ponyhaven_smooth',false) then
  ph.smooth_volume(data,area,minp,maxp,param2)
 end
 vm:set_data(data);vm:set_param2_data(param2);vm:calc_lighting();vm:write_to_map()
end)
core.register_on_shutdown(function()for _,r in pairs(files)do r.file:close()end end)
