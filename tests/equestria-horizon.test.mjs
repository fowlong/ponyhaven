import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {EquestriaWorldReader} from '../desktop/equestria/world-reader.mjs';
import {scatteredBooks,spellNames} from '../desktop/equestria/book-locations.mjs';
import {meshGrid,regionGrid,reduceGrid} from '../desktop/equestria/distant-mesh.mjs';
import {packRegion} from '../desktop/equestria/region-store.mjs';
import {regionColumns,columnMesh,exposedIntervals,sceneryOBJ} from '../desktop/equestria/scenery-columns.mjs';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const mod='native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven';
test('seven unique books span the world, have dry headroom and regenerate identically',async()=>{
 const world=new EquestriaWorldReader('native/equestria/world'),e=JSON.parse(await fs.readFile(mod+'/encounters.json','utf8'));
 const locations=JSON.parse(await fs.readFile('native/equestria/world/locations.json','utf8'));
 assert.deepEqual(e.books.map(b=>b.name),spellNames);assert.equal(new Set(e.books.map(b=>b.id)).size,7);
 assert.deepEqual(scatteredBooks(world,locations.towns,e.bosses),e.books);
 for(let i=0;i<7;i++){
  const b=e.books[i];assert.ok(world.material(b.x,b.y-.5,b.z).solid);
  for(const dy of [1,2]){const m=world.material(b.x,b.y+dy,b.z);assert.ok(!m.solid&&m.shape!=='liquid');}
  for(let j=0;j<i;j++)assert.ok(Math.hypot(b.x-e.books[j].x,b.z-e.books[j].z)>=1400);
 }
 assert.ok(Math.max(...e.books.map(b=>b.x))-Math.min(...e.books.map(b=>b.x))>8000);
 assert.ok(Math.max(...e.books.map(b=>b.z))-Math.min(...e.books.map(b=>b.z))>5500);
});
test('compressed scenery tiles match their hashes, media limits and bundled world',async()=>{
 const world=JSON.parse(await fs.readFile('native/equestria/world/world.json','utf8')),h=JSON.parse(await fs.readFile(mod+'/horizon.json','utf8'));
 assert.equal(h.worldHash,world.worldHash);assert.equal(h.version,4);assert.equal(h.step,2);assert.equal(h.lowStep,4);assert.equal(h.verticalStep,1);assert.equal(h.maxDistance,1024);
 const texture=await fs.readFile(mod+'/textures/eq_horizon.png');assert.equal(texture.readUInt32BE(16),h.textureWidth);assert.equal(texture.readUInt32BE(20),h.textureHeight);
 assert.equal(h.tiles.length,6860);assert.equal(h.anchorGuard,true);assert.equal(new Set(h.tiles.map(t=>t.id)).size,h.tiles.length);
 for(const tile of h.tiles.flatMap(t=>[t,t.low])){
  const data=inflateSync(await fs.readFile(mod+'/scenery/'+tile.mesh+'.deflate'));
  assert.equal(data.length,tile.bytes);assert.ok(data.length<16_000_000);assert.equal(createHash('sha1').update(data).digest('hex'),tile.sha1);
  assert.ok(data.includes(Buffer.from('v -160 -160 -160\nv 160 160 160')),'Moving network anchors need frustum bounds around the camera');
 }
});
test('thin walls, floating roofs and ground retain actual heights instead of expanding to coarse cubes',()=>{
 const indices=new Uint16Array(4096);indices[3+16*6+256*5]=1;indices[10+16*10+256*13]=2;
 const region=packRegion([{slot:0,chunk:{sections:[{y:0,names:['air','wall','roof'],indices}]}}],new Map([['air',0],['wall',1],['roof',2]]),0,1);
 const grid=regionColumns(region,new Uint16Array([0,1,2]),2),quads=columnMesh(grid);
 assert.deepEqual(grid.columns[1+3*grid.width],[5,6,1]);assert.deepEqual(grid.columns[5+5*grid.width],[13,14,2]);
 const top=quads.filter(q=>q.face===2);assert.deepEqual(top.map(q=>q.vertices[0][1]).sort((a,b)=>a-b),[6,14]);
 // OBJ's X reflection and native 10-units-per-node scale must reconstruct the
 // same source plane in both negative and positive world regions.
 const obj=sceneryOBJ(top,{rx:-2,rz:3,minY:0,step:2,textureWidth:64,textureHeight:8});
 const p=obj.split('\n').filter(l=>l.startsWith('v ')).map(l=>l.split(' ').slice(1).map(Number)).map(v=>[-v[0]/10,v[1]/10,v[2]/10]);
 assert.ok(p.every(v=>v[0]>=-1024&&v[0]<=-1012&&v[2]<-1535));assert.deepEqual([...new Set(p.map(v=>v[1]))].sort((a,b)=>a-b),[5.5,13.5]);
});
test('adjacent solid intervals hide internal faces but retain windows and underpasses',()=>{
 assert.deepEqual(exposedIntervals([0,5,1,5,10,2],[0,2,3,7,12,4]),[2,5,1,5,7,2]);
 assert.deepEqual(exposedIntervals([0,10,1],[0,5,2,5,10,3]),[]);
});
test('coarse geometry preserves volumes, empty space and material boundaries',()=>{
 // A floating one-cell roof: a height-only reconstruction would connect it
 // to the ground. The volume mesher must produce a closed six-face cube.
 const data=new Uint16Array(4*4*4);data[1+4*(3+4)]=2;
 const quads=meshGrid({size:[4,4,4],data});assert.equal(quads.length,6);
 assert.ok(quads.every(q=>q.colour===2&&q.vertices.every(p=>p[1]>=3)));
 data[2+4*(3+4)]=3;const adjacent=meshGrid({size:[4,4,4],data});assert.equal(adjacent.length,10);
 assert.ok(!adjacent.some(q=>q.face<2&&q.vertices.every(p=>p[0]===2)),'Internal shared face should not be rendered');
 data[2+4*(3+4)]=2;assert.equal(meshGrid({size:[4,4,4],data}).length,6,'Coplanar faces should merge');
});
test('source sections keep XYZ placement, thin walls and colours through both scenery levels',()=>{
 const indices=new Uint16Array(4096);indices[1+16*2+256*12]=1;indices[14+16*14+256*2]=2;
 const region=packRegion([{slot:33,chunk:{sections:[{y:0,names:['air','roof','wall'],indices}]}}],new Map([['air',0],['roof',1],['wall',2]]),0,1);
 const grid=regionGrid(region,new Uint16Array([0,1,2]),3),at=(x,y,z)=>x+64*(y+4*z);
 assert.equal(grid.data[at(2,1,2)],1);assert.equal(grid.data[at(3,0,3)],2);
 assert.equal(grid.data.filter(Boolean).length,2,'Even a thin structure must survive downsampling');
 const reduced=reduceGrid(grid,4,3);assert.equal(reduced.data.filter(Boolean).length,1);
});
