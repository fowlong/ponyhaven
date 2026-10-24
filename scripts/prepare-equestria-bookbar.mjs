import fs from 'node:fs/promises';
import {png} from './equestria-pixels.mjs';
const root='native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven/textures';
await fs.mkdir(root,{recursive:true});
const w=78,h=108;
for(const [state,border]of Object.entries({locked:[78,83,105],owned:[153,128,193],equipped:[255,218,139]})){
 const pixels=new Uint8Array(w*h*4);
 const rounded=(x,y,inset)=>{
  const r=6,dx=Math.max(inset+r-x,x-(w-1-inset-r),0),dy=Math.max(inset+r-y,y-(h-1-inset-r),0);
  return x>=inset&&y>=inset&&x<w-inset&&y<h-inset&&dx*dx+dy*dy<=r*r;
 };
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(!rounded(x,y,0))continue;
  const edge=!rounded(x,y,state==='equipped'?3:1),shine=1-y/h;
  const fill=state==='equipped'?[48+shine*12,41+shine*10,64+shine*12]:[29+shine*9,29+shine*7,43+shine*12];
  pixels.set([...(edge?border:fill).map(Math.round),edge?255:238],(y*w+x)*4);
 }
 await fs.writeFile(`${root}/eq_book_slot_${state}.png`,png(w,h,pixels));
}
console.log('Prepared locked, unlocked and equipped spellbook HUD panels.');
