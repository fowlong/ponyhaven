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
