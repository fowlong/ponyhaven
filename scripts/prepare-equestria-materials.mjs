import fs from 'node:fs/promises';
import path from 'node:path';
import {materialDefinition} from '../desktop/equestria/materials.mjs';
import {png} from './equestria-pixels.mjs';
const mod=path.resolve('native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven');
const report=JSON.parse(await fs.readFile('tmp/equestria-world-report.json','utf8'));
const states=['minecraft:air',...Object.keys(report.blockStates).filter(s=>s!=='minecraft:air').sort()];
const defs=states.map(materialDefinition),seen=new Set();
await fs.mkdir(path.join(mod,'textures'),{recursive:true});
for(const def of defs){
 if(seen.has(def.base))continue;seen.add(def.base);
 const size=16,rgba=new Uint8Array(size*size*4),{base,colour:c}=def;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  let noise=((x*73+y*151+x*y*13)%17-8)*.6,alpha=255;
  if(/bricks|brick_stairs|brick_slab/.test(base)&& (y%6===0 || (x+(Math.floor(y/6)%2)*5)%10===0))noise=-18;
  if(/planks|wood|log|stairs|slab|chest/.test(base)&&y%5===0)noise-=12;
  if(/glass|ice/.test(base)){alpha=x===0||y===0?200:65;noise=x===y?22:0;}
  if(def.shape==='liquid')alpha=185;
  if(def.shape==='plant'){
   const stem=x===7||x===8,flower=y<7&&((x-8)**2+(y-4)**2<13),leaf=y>6&&(x===y-2||x===17-y);
   alpha=stem||flower||leaf?255:0;
  }
  const at=(y*size+x)*4;
  for(let i=0;i<3;i++)rgba[at+i]=Math.max(0,Math.min(255,Math.round(c[i]+noise)));
  if(def.shape==='plant'&&y>=7){rgba[at]=105;rgba[at+1]=158;rgba[at+2]=90;}rgba[at+3]=alpha;
 }
 await fs.writeFile(path.join(mod,'textures',def.texture),png(size,size,rgba));
}
const lookup=new Map(defs.map(d=>[d.source,d.id]));
for(const d of defs)if(d.door)d.toggle=lookup.get(d.source.replace(/open=(true|false)/,(_,v)=>'open='+(v==='true'?'false':'true')));
await fs.writeFile(path.join(mod,'materials.json'),JSON.stringify(defs));
console.log(`Prepared ${defs.length} block states and ${seen.size} original material textures; every source state has an explicit shape.`);
