// A cheaper outer tier, retaining exact source heights and the same colour atlas.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {materialDefinition} from '../desktop/equestria/materials.mjs';
import {regionColumns,columnMesh,sceneryOBJ} from '../desktop/equestria/scenery-columns.mjs';
const root='native/equestria/world',mod='native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven';
const h=JSON.parse(await fs.readFile(mod+'/horizon.json','utf8')),tiles=new Map(h.tiles.map(t=>[t.id,t])),palette=new Map();
const states=JSON.parse(await fs.readFile(root+'/states.json','utf8'));
const colours=Uint16Array.from(states.map((s,i)=>{const m=materialDefinition(s,i);if(m.shape==='air'||m.shape==='plant'||(!m.solid&&m.shape!=='liquid'))return 0;const key=m.colour.join(',');if(!palette.has(key))palette.set(key,palette.size+1);return palette.get(key);}));
const files=(await fs.readdir(root+'/regions')).filter(n=>n.endsWith('.eqr')).sort();let triangles=0,bytes=0,packedBytes=0;
for(let i=0;i<files.length;i++){
 const [,rx,rz]=/^r\.(-?\d+)\.(-?\d+)\.eqr$/.exec(files[i]).map(Number);
 const grid=regionColumns(await fs.readFile(root+'/regions/'+files[i]),colours,4),groups=new Map();
 for(const q of columnMesh(grid)){
  const minX=Math.min(...q.vertices.map(p=>p[0])),maxX=Math.max(...q.vertices.map(p=>p[0])),minZ=Math.min(...q.vertices.map(p=>p[2])),maxZ=Math.max(...q.vertices.map(p=>p[2]));
  const x0=Math.min(3,Math.floor(minX/32)),x1=Math.min(3,Math.floor(Math.max(minX,maxX-.001)/32)),z0=Math.min(3,Math.floor(minZ/32)),z1=Math.min(3,Math.floor(Math.max(minZ,maxZ-.001)/32));
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
   const key=x+z*4;if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push({...q,vertices:q.vertices.map(p=>[Math.max(x*32,Math.min((x+1)*32,p[0])),p[1],Math.max(z*32,Math.min((z+1)*32,p[2]))])});
  }
 }
 for(const [key,faces]of groups){
  const x=key%4,z=Math.floor(key/4),mesh=`eq_ring4_${rx}_${rz}_${x}_${z}.obj`,tile=tiles.get(`${rx},${rz},${x},${z}`);if(!tile)throw Error('Missing matching detail tile');
  const data=Buffer.from(sceneryOBJ(faces,{rx,rz,minY:grid.minY,step:4,textureWidth:h.textureWidth,textureHeight:h.textureHeight}));
  const packed=deflateSync(data,{level:6});await fs.writeFile(mod+'/scenery/'+mesh+'.deflate',packed);
  tile.low={mesh,sha1:createHash('sha1').update(data).digest('hex'),bytes:data.length,triangles:faces.length*2};triangles+=faces.length*2;bytes+=data.length;packedBytes+=packed.length;
 }
 if(i%80===0)console.log(`Outer scenery ${i}/${files.length}: ${Math.round(packedBytes/1048576)} MiB`);
}
if(h.tiles.some(t=>!t.low))throw Error('Incomplete outer scenery');
h.version=4;h.lowStep=4;h.lowTriangles=triangles;h.lowBytes=bytes;h.lowPackedBytes=packedBytes;h.ringWidth=256;
await fs.writeFile(mod+'/horizon.json',JSON.stringify(h));console.log('Outer tier complete:',triangles,'triangles,',Math.round(packedBytes/1048576),'MiB bundled.');
