local ph=ponyhaven
local function time()return ph.seconds or 0 end
core.register_entity('ponyhaven:health',{initial_properties={visual='sprite',textures={'eq_health_20.png'},physical=false,pointable=false,static_save=false,glow=14,visual_size={x=1.8,y=.23}},
 on_step=function(self)if not self.owner or not self.owner:get_pos()then self.object:remove()end end})
function ph.health_bar(self,height,width)
 if not self.object:get_pos()then return end
 local bar=self.healthbar
 if not bar or not bar:get_pos()then
  bar=core.add_entity(self.object:get_pos(),'ponyhaven:health');if not bar then return end
  bar:get_luaentity().owner=self.object;bar:set_attach(self.object,'',{x=0,y=height*10,z=0},{x=0,y=0,z=0});self.healthbar=bar
  bar:set_properties({visual_size={x=width,y=width/8}})
 end
 bar:set_properties({textures={'eq_health_'..math.max(0,math.min(20,math.ceil((self.hp or 45)/(self.maxhp or 45)*20)))..'.png'}})
end
core.register_entity('ponyhaven:area_fx',{initial_properties={visual='mesh',mesh='eq_area.obj',textures={'eq_area.png'},physical=false,pointable=false,static_save=false,glow=14,shaded=false,use_texture_alpha=true,backface_culling=false},
 on_step=function(self,dt)
  self.age=(self.age or 0)+dt;if not self.duration or self.age>self.duration then self.object:remove();return end
  if self.growing then local r=self.radius*(.3+.7*self.age/self.duration);self.object:set_properties({visual_size={x=r,y=1,z=r}})end
 end})
function ph.area_fx(pos,r,colour,duration,growing)
 local obj=core.add_entity(vector.offset(pos,0,.12,0),'ponyhaven:area_fx');if not obj then return end
 local e=obj:get_luaentity();e.radius=r;e.duration=duration or .5;e.growing=growing
 obj:set_properties({visual_size={x=r,y=1,z=r},textures={'eq_area.png^[multiply:'..colour}})
end
function ph.impact_fx(pos,r,colour)
 ph.area_fx(pos,r,colour or '#c6b6ff',.5,true)
 for i=1,12 do local a=i*math.pi/6;core.add_particle({pos=pos,velocity={x=math.cos(a)*r*2,y=2+math.sin(a*3),z=math.sin(a)*r*2},acceleration={x=0,y=-8,z=0},expirationtime=.45,size=5,glow=14,texture='eq_spark.png^[multiply:'..(colour or '#c6b6ff')})end
 if ph.sound then ph.sound('impact',pos,.35,1/math.max(1,r*.2))end
end
function ph.attack_warning(self,duration)
 self.warn_until=time()+duration;self.attack_anim_until=self.warn_until+.5;self.warn_flash=nil
 self.attack_base_size=self.attack_base_size or self.object:get_properties().visual_size
 local s=self.sheet or{frames=7,delay=.11};self.object:set_sprite({x=0,y=0},s.frames,math.max(.035,s.delay*.5),false)
 if ph.sound then ph.sound('warning',self.object:get_pos(),self.boss and .65 or .3,self.boss and .8 or 1.3)end
end
function ph.step_warning(self)
 local active=time()<(self.warn_until or 0);local flash=active and math.floor(time()*7)%2==0
 if flash~=self.warn_flash then
  self.object:set_texture_mod(flash and '^[colorize:#ff234a:175' or '');self.warn_flash=flash
  if self.attack_base_size then local s=self.attack_base_size;local pulse=flash and 1.035 or 1;self.object:set_properties({visual_size={x=s.x*pulse,y=s.y*pulse,z=s.z or 1}})end
 end
 if self.attack_anim_until and time()>self.attack_anim_until then
  self.attack_anim_until=nil;local s=self.sheet or{frames=7,delay=.11};self.object:set_sprite({x=0,y=0},s.frames,s.delay,false)
 end
end
