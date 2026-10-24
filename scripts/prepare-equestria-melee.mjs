import fs from 'node:fs/promises';
import path from 'node:path';
import {png} from './equestria-pixels.mjs';
const mod=path.resolve('native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven');
await fs.mkdir(path.join(mod,'models'),{recursive:true});
await fs.mkdir(path.join(mod,'textures'),{recursive:true});
// A horizontal crescent ribbon. Luanti animates its sweep on the client.
let obj='# Ponyhaven horizontal melee trail\n',index=1;
for(let i=0;i<40;i++){
 const point=(t,r)=>{const a=(-65+95*t)*Math.PI/180;return [Math.sin(a)*r*10,0,Math.cos(a)*r*10];};
 const a=i/40,b=(i+1)/40;
 const vertices=[[point(a,.65),a,0],[point(a,1),a,1],[point(b,1),b,1],[point(b,.65),b,0]];
 // Irrlicht's OBJ loader mirrors X and reverses triangle winding.
 for(const [p,u,v]of vertices)obj+=`v ${-p[0]} ${p[1]} ${p[2]}\nvt ${u} ${v}\nvn 0 1 0\n`;
 obj+=`f ${index+2}/${index+2}/${index+2} ${index+1}/${index+1}/${index+1} ${index}/${index}/${index}\n`;
 obj+=`f ${index+3}/${index+3}/${index+3} ${index+2}/${index+2}/${index+2} ${index}/${index}/${index}\n`;index+=4;
}
await fs.writeFile(path.join(mod,'models/eq_melee_arc.obj'),obj);
const width=128,height=32,rgba=new Uint8Array(width*height*4);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 const u=x/(width-1),v=y/(height-1),edge=Math.sin(Math.PI*v);
 rgba.set([255,255,255,Math.round(255*Math.pow(u,.6)*Math.pow(edge,.55))],(y*width+x)*4);
}
await fs.writeFile(path.join(mod,'textures/eq_melee_trail.png'),png(width,height,rgba));
console.log('Prepared horizontal crescent melee ribbon and fading trail.');
