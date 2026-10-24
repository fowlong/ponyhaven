ponyhaven = {path=core.get_modpath('ponyhaven'), world=core.get_worldpath()}
local ph=ponyhaven
function ph.read_json(filename)
 local file=io.open(filename,'rb');if not file then return nil end
 local text=file:read('*a');file:close();return core.parse_json(text)
end
function ph.emit(value)
 value.session=core.settings:get('ponyhaven_session') or ''
 print('PONYHAVEN_EQUESTRIA '..core.write_json(value))
end
-- One HUD scale for every element: 1 at a 1280x720 window, growing and shrinking
-- with the tighter side so text keeps its layout. Rounded to avoid HUD churn.
function ph.hud_scale(name)
 local info=core.get_player_window_information(name)
 if not info then return 1 end
 local k=info.real_hud_scaling or 1
 local s=math.min(info.size.x/k/1280,info.size.y/k/720)
 return math.floor(math.min(2.5,math.max(.45,s))*20+.5)/20
end
ph.materials=assert(ph.read_json(ph.path..'/materials.json'),'Missing material definitions')
dofile(ph.path..'/materials.lua')
dofile(ph.path..'/surfaces.lua')
dofile(ph.path..'/world.lua')
dofile(ph.path..'/horizon.lua')
dofile(ph.path..'/adventure.lua')
dofile(ph.path..'/feedback.lua')
dofile(ph.path..'/combat.lua')
dofile(ph.path..'/music.lua')
dofile(ph.path..'/maps.lua')
core.register_on_mods_loaded(function()ph.emit({kind='ready',engine='luanti'})end)
