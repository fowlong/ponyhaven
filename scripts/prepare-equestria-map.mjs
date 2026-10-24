import fs from 'node:fs/promises';
import {EquestriaWorldReader} from '../desktop/equestria/world-reader.mjs';
import {png} from './equestria-pixels.mjs';
const world=new EquestriaWorldReader('native/equestria/world'),w=384,h=272,rgba=new Uint8Array(w*h*4),samples=[];
for(let py=0;py<h;py++)for(let px=0;px<w;px++){
 const x=Math.round(world.info.min.x+(px+.5)/w*(world.info.max.x-world.info.min.x));
 const z=Math.round(world.info.max.z-(py+.5)/h*(world.info.max.z-world.info.min.z));
 samples.push({px,py,x,z,region:Math.floor(x/512)+','+Math.floor(-z/512)});
}
samples.sort((a,b)=>a.region.localeCompare(b.region));
for(const {px,py,x,z} of samples){
 let colour=[93,145,169];
 for(let y=world.info.max.y;y>=world.info.min.y;y--){
  const m=world.material(x,y,z);if(m.shape==='air')continue;
  const shade=.8+Math.min(120,Math.max(0,y))/600;colour=m.colour.map(c=>Math.min(255,Math.round(c*shade)));break;
 }
 rgba.set([...colour,255],(py*w+px)*4);
}
const root='native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven';
await fs.writeFile(root+'/textures/eq_worldmap.png',png(w,h,rgba));
await fs.writeFile(root+'/map.json',JSON.stringify({width:w,height:h,min:world.info.min,max:world.info.max}));
console.log('Rendered a complete Equestria overview from the included voxel world.');
