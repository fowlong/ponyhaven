import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readZipEntries} from '../desktop/levels.mjs';
import {engineAssetsReady,readDefaultWorld,ENGINE_FOLDER} from '../desktop/equestria/assets.mjs';
import {EquestriaGame} from '../desktop/equestria/runtime.mjs';

const app=path.resolve(process.argv[2]||'release/Ponyhaven-0.3.0-win32-x64/resources/app');
const native=path.join(app,'native/equestria'),engine=path.join(native,ENGINE_FOLDER);
assert.ok(await engineAssetsReady(native),'Release is missing required Luanti shaders or executable.');
// Compare every shipped shader to the original official engine archive, not a
// small hand-written file list that could miss another required render pass.
const zip=await fs.readFile('tmp/equestria/luanti-5.17.0-win64.zip');
assert.equal(createHash('sha256').update(zip).digest('hex'),'3ce20c77f5c206a988d7a6b883439e2759e3cf67428c9dbcf99ecd2936da631c');
const shaders=readZipEntries(zip).filter(e=>e.name.startsWith(ENGINE_FOLDER+'/client/shaders/')&&!e.name.endsWith('/'));
assert.ok(shaders.length>20);
for(const entry of shaders)assert.deepEqual(await fs.readFile(path.join(native,entry.name)),entry.data,'Changed/missing shader: '+entry.name);
const world=await readDefaultWorld(native,{verify:true});
const gameMod=path.join(engine,'games/ponyhaven/mods/ponyhaven');
for(const file of ['surfaces.json','encounters.json','map.json','combat.lua','maps.lua','feedback.lua','music.lua','models/eq_melee_arc.obj','models/eq_area.obj','textures/eq_melee_trail.png','textures/eq_health_20.png','textures/eq_dark_orb.png','sounds/eq_piano.ogg','sounds/eq_boss.ogg','WYRDA_LICENSE.txt'])await fs.access(path.join(gameMod,file));
for(const state of ['locked','owned','equipped'])await fs.access(path.join(gameMod,'textures','eq_book_slot_'+state+'.png'));
for(const file of ['horizon.lua','horizon.json','textures/eq_horizon.png','shaders/object_shader/opengl_vertex.glsl','shaders/object_shader/opengl_fragment.glsl','shaders/nodes_shader/opengl_vertex.glsl','shaders/nodes_shader/opengl_fragment.glsl','shaders/cloud_shader/opengl_vertex.glsl'])await fs.access(path.join(gameMod,file));
await fs.access(path.join(app,'desktop/equestria/keys.ps1'));
const encounters=JSON.parse(await fs.readFile(path.join(gameMod,'encounters.json'),'utf8'));
const horizon=JSON.parse(await fs.readFile(path.join(gameMod,'horizon.json'),'utf8'));
assert.equal(horizon.version,4);assert.equal(horizon.anchorGuard,true);assert.equal(horizon.worldHash,world.info.worldHash);assert.equal(horizon.tiles.length,6860);
const ponies=JSON.parse(await fs.readFile(path.join(gameMod,'ponies.json'),'utf8'));for(const motions of Object.values(ponies))for(const sheet of Object.values(motions))assert.equal(sheet.columns,8);
for(const file of ['controller.mjs','view-distance.mjs','terrain-cache.mjs'])await fs.access(path.join(app,'desktop/equestria',file));
for(const tile of horizon.tiles.flatMap(t=>[t,t.low]))await fs.access(path.join(gameMod,'scenery',tile.mesh+'.deflate'));
assert.equal(await fs.stat(path.join(gameMod,'models/eq_horizon.obj')).then(()=>true,()=>false),false,'Retired whole-map backdrop is still bundled');
assert.equal(encounters.books.length,7);assert.equal(encounters.bosses.length,16);
assert.equal(new Set(encounters.books.map(b=>b.id)).size,7);assert.equal(new Set(encounters.books.map(b=>`${b.x},${b.y},${b.z}`)).size,7);
for(const name of ['cache','worlds','mod_data','client/mod_storage.sqlite','client/serverlist'])
 assert.equal(await fs.stat(path.join(engine,name)).then(()=>true,()=>false),false,'User data leaked into package: '+name);
const profile=path.resolve('tmp/equestria-release-status-'+Date.now());
const game=new EquestriaGame(native,profile,()=>{}, {headless:true});
const status=await game.status();assert.equal(status.engine,true);assert.equal(status.world,true);assert.equal(game.imported,world.root);
assert.equal(await fs.stat(profile).then(()=>true,()=>false),false,'Checking the included map should not require creating/importing a profile world.');
console.log(`Equestria release passed: ${shaders.length} original shaders, all 494 converted regions, 50 chests and a fresh profile ready without importing.`);
