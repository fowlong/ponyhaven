import fs from 'node:fs/promises';
import {png} from './equestria-pixels.mjs';
const folder='native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven/textures/';
for(const kind of ['ring','parcel','chest','blank']){
 const n=32,pixels=new Uint8Array(n*n*4);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const at=(y*n+x)*4,dx=x-15.5,dy=y-15.5,r=Math.hypot(dx,dy);let c=[0,0,0,0];
  if(kind==='ring'&&r>8&&r<14)c=[255,Math.round(201+(dx-dy)*1.1),84,255];
  if(kind==='parcel'&&x>=4&&x<=27&&y>=5&&y<=26)c=x>=14&&x<=17||y>=14&&y<=17?[248,209,114,255]:[187,148,218,255];
  if(kind==='chest')c=(x<3||x>28||y<3||y>28||x>=14&&x<=17)?[233,195,96,255]:[145+(y%5)*3,101+(y%5)*3,74,255];
  pixels.set(c,at);
 }
 await fs.writeFile(folder+`eq_${kind}.png`,png(n,n,pixels));
}
