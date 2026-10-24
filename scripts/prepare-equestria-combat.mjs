import fs from 'node:fs/promises';
import path from 'node:path';
import {readZipEntries} from '../desktop/levels.mjs';
import {png} from './equestria-pixels.mjs';
import {EquestriaWorldReader} from '../desktop/equestria/world-reader.mjs';
import {scatteredBooks} from '../desktop/equestria/book-locations.mjs';
import './prepare-equestria-melee.mjs';
import './prepare-equestria-bookbar.mjs';
const mod=path.resolve('native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven');
const texture=path.join(mod,'textures');await fs.mkdir(texture,{recursive:true});
const wyrda=readZipEntries(await fs.readFile('tmp/equestria/Wyrda-main.zip'));
for(const e of wyrda.filter(e=>/\/textures\/wyrda_(spell|snow_overlay|electric_overlay).*\.png$/.test(e.name)))await fs.writeFile(path.join(texture,path.basename(e.name)),e.data);
await fs.writeFile(path.join(mod,'WYRDA_LICENSE.txt'),wyrda.find(e=>e.name==='Wyrda-main/LICENSE').data);
const palette=[[255,90,141],[255,176,87],[255,239,121],[118,234,170],[110,198,255],[174,133,255]];
for(const name of ['orb','aura','slash','spark','quest','quest_done','marker','boss_marker','book_marker']){
 const size=64,rgba=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const dx=(x-31.5)/31,dy=(y-31.5)/31,r=Math.hypot(dx,dy),a=Math.atan2(dy,dx);let alpha=0;
  let colour=palette[Math.floor((a+Math.PI)/(2*Math.PI)*6)%6];
  if(name==='orb'){alpha=Math.max(0,1-r)**.35*255;colour=colour.map(v=>Math.round(v+(255-v)*Math.max(0,1-r*2)));}
  if(name==='aura')alpha=Math.max(0,1-Math.abs(r-.72)/.21)*230;
  if(name==='slash')alpha=Math.abs(a)<2.1?Math.max(0,1-Math.abs(r-.7)/.22)*(1-Math.abs(a)/2.4)*255:0;
  if(name==='spark'){alpha=Math.max(0,1-r)*255;colour=[255,255,255];}
  if(name.startsWith('quest')){colour=name==='quest_done'?[126,255,181]:[255,228,100];alpha=((Math.abs(dx)<.11&&dy>-.7&&dy<.25)||(Math.abs(dx)<.12&&dy>.4&&dy<.62))?255:0;}
  if(name.endsWith('marker')){colour=name==='boss_marker'?[255,102,133]:name==='book_marker'?[207,157,255]:[255,244,178];alpha=r<.65?255:0;}
  rgba.set([...colour,Math.round(alpha)],(y*size+x)*4);
 }
 await fs.writeFile(path.join(texture,'eq_'+name+'.png'),png(size,size,rgba));
}
const catalog=JSON.parse(await fs.readFile('public/data/ponies.json','utf8'));
const names=(await fs.readFile('tmp/equestria/boss list.txt','utf8')).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
const roster=names.map(name=>{const p=catalog.find(p=>p.name.toLowerCase()===name.toLowerCase());if(!p)throw Error('Missing boss: '+name);return {id:p.id,name:p.name};});
const world=new EquestriaWorldReader('native/equestria/world'),locations=JSON.parse(await fs.readFile('native/equestria/world/locations.json','utf8'));
let seed=0x45515532;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const bosses=[];
for(const boss of roster){
 for(let attempt=0;attempt<3000;attempt++){
  const x=Math.round(world.info.min.x+250+random()*(world.info.max.x-world.info.min.x-500)),z=Math.round(world.info.min.z+250+random()*(world.info.max.z-world.info.min.z-500));
  if(locations.towns.some(t=>Math.hypot(t.x-x,t.z-z)<650)||bosses.some(b=>Math.hypot(b.x-x,b.z-z)<400))continue;
  const p=world.nearby(x,z,undefined,16,true);if(!p)continue;
  // Room for a giant and its dodge arena; avoid roofs, towns and cliff edges.
  if([[25,0],[-25,0],[0,25],[0,-25]].some(([dx,dz])=>{const q=world.surface(p.x+dx,p.z+dz,undefined,true);return !q||Math.abs(q.y-p.y)>8;}))continue;
  const deck=['volley','nova','meteors','spiral','crossfire'];for(let i=deck.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  bosses.push({...boss,...p,moves:deck.slice(0,3),colour:palette[bosses.length%6].map(n=>n.toString(16).padStart(2,'0')).join('')});break;
 }
 if(bosses.length<roster.indexOf(boss)+1)throw Error('Could not safely place '+boss.name);
}
const books=scatteredBooks(world,locations.towns,bosses);
await fs.writeFile(path.join(mod,'encounters.json'),JSON.stringify({bosses,books},null,2));
await fs.writeFile('src/equestria-bosses.json',JSON.stringify(roster,null,2));
await fs.writeFile('desktop/equestria/bosses.json',JSON.stringify(roster,null,2));
console.log('Prepared combat effects, seven Wyrda books and sixteen fixed wilderness boss arenas.');
