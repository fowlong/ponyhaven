// Build medium-detail scenery for a bounded fog ring, preserving source heights.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {materialDefinition} from '../desktop/equestria/materials.mjs';
import {regionColumns,columnMesh,sceneryOBJ} from '../desktop/equestria/scenery-columns.mjs';
import {png} from './equestria-pixels.mjs';
const root='native/equestria/world',mod='native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven';
const info=JSON.parse(await fs.readFile(root+'/world.json','utf8')),states=JSON.parse(await fs.readFile(root+'/states.json','utf8'));
const colours=[[0,0,0]],lookup=new Map(),stateColours=Uint16Array.from(states.map((state,id)=>{
 const m=materialDefinition(state,id);if(m.shape==='air'||m.shape==='plant'||(!m.solid&&m.shape!=='liquid'))return 0;
 const key=m.colour.join(',');if(!lookup.has(key)){lookup.set(key,colours.length);colours.push(m.colour);}return lookup.get(key);
}));
const textureWidth=64,textureHeight=2**Math.ceil(Math.log2(Math.ceil(colours.length*6/textureWidth))),pixels=new Uint8Array(textureWidth*textureHeight*4);
const shade=[.86,.8,1,.66,.9,.82];
for(let c=1;c<colours.length;c++)for(let side=0;side<6;side++)pixels.set([...colours[c].map(n=>Math.round(n*shade[side])),255],(c*6+side)*4);
await fs.mkdir(path.join(mod,'scenery'),{recursive:true});await fs.mkdir(path.join(mod,'textures'),{recursive:true});
await fs.writeFile(path.join(mod,'textures/eq_horizon.png'),png(textureWidth,textureHeight,pixels));
const tiles=[];let triangles=0,bytes=0,packedBytes=0;
const regions=(await fs.readdir(root+'/regions')).filter(n=>n.endsWith('.eqr')).sort();
for(let i=0;i<regions.length;i++){
 const file=regions[i],[,rx,rz]=/^r\.(-?\d+)\.(-?\d+)\.eqr$/.exec(file).map(Number);
 const grid=regionColumns(await fs.readFile(root+'/regions/'+file),stateColours,2),quads=columnMesh(grid);
 // Subdivide each region into 128-node tiles for precise visibility and small
 // media payloads. Triangles retain world coordinates and never follow a pony.
 const groups=new Map();
 for(const q of quads){
  const minX=Math.min(...q.vertices.map(p=>p[0])),maxX=Math.max(...q.vertices.map(p=>p[0]));
  const minZ=Math.min(...q.vertices.map(p=>p[2])),maxZ=Math.max(...q.vertices.map(p=>p[2]));
  // Greedy faces may span several tiles. Clip rectangles at tile boundaries.
  const x0=Math.min(3,Math.floor(minX/64)),x1=Math.min(3,Math.floor(Math.max(minX,maxX-.001)/64));
  const z0=Math.min(3,Math.floor(minZ/64)),z1=Math.min(3,Math.floor(Math.max(minZ,maxZ-.001)/64));
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
   const face={...q,vertices:q.vertices.map(p=>[Math.max(x*64,Math.min((x+1)*64,p[0])),p[1],Math.max(z*64,Math.min((z+1)*64,p[2]))])};
   const key=x+z*4;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(face);
  }
 }
 for(const [key,faces]of groups){
  const x=key%4,z=Math.floor(key/4),mesh=`eq_ring_${rx}_${rz}_${x}_${z}.obj`;
  const data=Buffer.from(sceneryOBJ(faces,{rx,rz,minY:grid.minY,step:2,textureWidth,textureHeight}));
  if(data.length>16_000_000)throw Error('Scenery media too large: '+mesh);
  const compressed=deflateSync(data,{level:6});await fs.writeFile(path.join(mod,'scenery',mesh+'.deflate'),compressed);packedBytes+=compressed.length;
  const sha1=createHash('sha1').update(data).digest('hex');
  tiles.push({id:`${rx},${rz},${x},${z}`,mesh,sha1,bytes:data.length,min:{x:rx*512+x*128-.5,z:-rz*512-(z+1)*128+.5},max:{x:rx*512+(x+1)*128-.5,z:-rz*512-z*128+.5},triangles:faces.length*2});
  triangles+=faces.length*2;bytes+=data.length;
 }
 if(i%40===0)console.log(`Accurate scenery: ${i}/${regions.length} regions, ${Math.round(packedBytes/1048576)} MiB bundled`);
}
await fs.writeFile(path.join(mod,'horizon.json'),JSON.stringify({version:3,worldHash:info.worldHash,step:2,verticalStep:1,tileSize:128,maxDistance:1024,ringWidth:384,nearClearance:32,triangles,bytes,packedBytes,textureWidth,textureHeight,tiles}));
console.log(`Scenery ring ready: ${tiles.length} tiles, ${triangles} triangles across the map, ${Math.round(packedBytes/1048576)} MiB bundled; only the local ring is sent/rendered.`);
