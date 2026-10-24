import fs from 'node:fs/promises';
import path from 'node:path';
import {readZipEntries} from '../desktop/levels.mjs';
import {png,doomPatch} from './equestria-pixels.mjs';
const mod=path.resolve('native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven');
await fs.mkdir(path.join(mod,'textures'),{recursive:true});
const entries=readZipEntries(await fs.readFile('native/adventure/characters.pk3'));
const palette=readZipEntries(await fs.readFile('native/adventure/srb2.pk3')).find(e=>e.name.split('/').pop()==='PLAYPAL').data.subarray(0,768);
const roster=['twilight','applejack','fluttershy','rarity','derpy','luna','trixie'],output={};
for(let p=0;p<roster.length;p++){
 const id=roster[p],prefix=`${p+1}_${id}/`,sprites=new Map(entries.filter(e=>e.name.startsWith(prefix)&&!e.name.endsWith('S_SKIN')).map(e=>[e.name.slice(prefix.length),doomPatch(e.data,palette)]));
 const motions={idle:'STND',walk:'WALK',run:'RUN_',roll:'ROLL',jump:'JUMP',swim:'SWIM',fly:'FLY_',glide:'GLID',climb:'CLMB',hurt:'PAIN'};
 output[id]={};
 for(const [motion,code] of Object.entries(motions)){
  let names=[...sprites.keys()].filter(n=>n.startsWith(code));if(!names.length)names=[...sprites.keys()].filter(n=>n.startsWith('STND'));
  const frames=[...new Set(names.map(n=>n[4]))].sort();
  const selected=frames.map(frame=>[1,2,3,4,5,6,7,8].map(direction=>{
   let name=names.find(n=>n[4]===frame&&(n[5]===String(direction)||n[7]===String(direction)||n[5]==='0'));
   name ||= names.find(n=>n[4]===frame);return {sprite:sprites.get(name),flip:name[7]===String(direction)};
  }));
  // A fixed canvas and foot anchor keep every motion at the original pixel scale.
  const w=128,h=128,baseline=112,rgba=new Uint8Array(w*8*h*frames.length*4);
  selected.forEach((row,fy)=>row.forEach(({sprite:s,flip},fx)=>{
   for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++){
    const dx=fx*w+w/2+(flip?s.left-1-x:x-s.left),dy=fy*h+baseline-s.top+y;
    if(dx<fx*w||dx>=(fx+1)*w||dy<fy*h||dy>=(fy+1)*h)continue;
    const at=(dy*w*8+dx)*4,from=(y*s.w+x)*4;rgba.set(s.rgba.subarray(from,from+4),at);
   }
  }));
  const texture=`eq_pony_${id}_${motion}.png`;await fs.writeFile(path.join(mod,'textures',texture),png(w*8,h*frames.length,rgba));
  output[id][motion]={texture,frames:frames.length,columns:8,width:w,height:h,baseline,pixelsPerNode:48};
 }
}
await fs.writeFile(path.join(mod,'ponies.json'),JSON.stringify(output));
const ponies=JSON.parse(await fs.readFile('public/data/ponies.json','utf8'));
const npcs=ponies.map(p=>{const b=p.behaviors.find(b=>b.name===p.idle)||p.behaviors.find(b=>b.movement==='none')||p.behaviors[0];return {id:p.id,name:p.name,path:b.right,filename:`eq_npc_${p.id}.png`};});
await fs.writeFile('tmp/equestria-npc-input.json',JSON.stringify(npcs,null,2));
console.log('Prepared seven original Adventure pony sprite atlases and NPC source manifest.');
