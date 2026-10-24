import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {inflateSync} from 'node:zlib';
import {ensureTerrainCache,resetTerrainCache} from '../desktop/equestria/terrain-cache.mjs';
import {materialDefinition} from '../desktop/equestria/materials.mjs';
const mod='native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven';
test('every pony direction and motion has visible pixels, including original swimming frames',async()=>{
 const ponies=JSON.parse(await fs.readFile(mod+'/ponies.json','utf8'));assert.equal(Object.keys(ponies).length,7);
 for(const [pony,motions]of Object.entries(ponies)){
  assert.ok(motions.swim);
  for(const [motion,sheet]of Object.entries(motions)){
   const data=await fs.readFile(mod+'/textures/'+sheet.texture),w=data.readUInt32BE(16),h=data.readUInt32BE(20),parts=[];
   assert.equal(sheet.columns,8);assert.equal(w,sheet.width*8);assert.equal(h,sheet.height*sheet.frames);
   for(let at=8;at<data.length;){const n=data.readUInt32BE(at);if(data.toString('ascii',at+4,at+8)==='IDAT')parts.push(data.subarray(at+8,at+8+n));at+=n+12;}
   const raw=inflateSync(Buffer.concat(parts));
   for(let row=0;row<sheet.frames;row++)for(let column=0;column<8;column++){
    let visible=0;for(let y=row*128;y<(row+1)*128;y++){assert.equal(raw[y*(w*4+1)],0);for(let x=column*128;x<(column+1)*128;x++)if(raw[y*(w*4+1)+1+x*4+3])visible++;}
    assert.ok(visible>100,`${pony} ${motion} row ${row} column ${column} is invisible`);
   }
  }
 }
});
test('terrain upgrade preserves progress and backs up an old cube cache once',async()=>{
 const root=await fs.mkdtemp(path.resolve('tmp/equestria-cache-test-'));
 await fs.writeFile(path.join(root,'map.sqlite'),'old terrain');await fs.writeFile(path.join(root,'mod_storage.sqlite'),'quests and discoveries');
 await fs.writeFile(path.join(root,'terrain-version.json'),JSON.stringify({version:2}));
 await ensureTerrainCache(root);
 const backup=(await fs.readdir(root)).find(n=>n.startsWith('terrain-before-'));
 assert.equal(await fs.readFile(path.join(root,backup,'map.sqlite'),'utf8'),'old terrain');
 assert.equal(await fs.readFile(path.join(root,'mod_storage.sqlite'),'utf8'),'quests and discoveries');
 await fs.writeFile(path.join(root,'map.sqlite'),'new smoothed terrain with destruction');await ensureTerrainCache(root);
 assert.equal(await fs.readFile(path.join(root,'map.sqlite'),'utf8'),'new smoothed terrain with destruction');
 await fs.writeFile(path.join(root,'players.sqlite'),'player locations');await resetTerrainCache(root);
 assert.equal(await fs.stat(path.join(root,'map.sqlite')).then(()=>true,()=>false),false);
 assert.equal(await fs.readFile(path.join(root,'players.sqlite'),'utf8'),'player locations');
 assert.equal(await fs.readFile(path.join(root,'mod_storage.sqlite'),'utf8'),'quests and discoveries');
 await fs.writeFile(path.join(root,'map.sqlite'),'new session damage');await resetTerrainCache(root);
 assert.equal(await fs.stat(path.join(root,'map.sqlite')).then(()=>true,()=>false),false);
});
test('building surfaces are smoothable without moving encounters onto roofs',()=>{
 for(const name of ['bricks','quartz_block','oak_planks','white_wool','white_stained_glass']){
  const m=materialDefinition('minecraft:'+name,1);assert.equal(m.smooth,true,name);assert.equal(m.terrain,false,name);
 }
 assert.equal(materialDefinition('minecraft:oak_door[open=false]',1).smooth,false);
 assert.equal(materialDefinition('minecraft:stone_stairs[facing=north,half=bottom,shape=straight]',1).smooth,false);
});
