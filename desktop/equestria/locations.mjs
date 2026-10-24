import {EquestriaWorldReader} from './world-reader.mjs';
export function buildEquestriaLocations(root,catalog) {
const world=new EquestriaWorldReader(root);
const townInputs=[{id:'ponyville',name:'Ponyville',x:0,y:8,z:16},{id:'canterlot',name:'Canterlot',x:616,y:64,z:844},{id:'cloudsdale',name:'Cloudsdale',x:-332,y:253,z:1703},{id:'crystal-empire',name:'Crystal Empire',x:-998,y:7,z:4279}];
const towns=[],npcs=[],chests=[];
for(let t=0;t<townInputs.length;t++){
 const input=townInputs[t],pos=world.nearby(input.x,input.z,input.y,50);if(!pos)throw Error('No safe town arrival: '+input.name);
 towns.push({...input,...pos});
 for(let i=0;i<4;i++){
  const angle=(i+.25)*Math.PI/2,p=world.nearby(pos.x+Math.round(Math.cos(angle)*18),pos.z+Math.round(Math.sin(angle)*18),pos.y,35);
  if(!p)throw Error('No town NPC floor.');
  const pony=catalog[(t*71+i*37+12)%catalog.length],targets=[];
  for(let q=0;q<8;q++){
   const a=q*Math.PI/4,target=world.nearby(p.x+Math.round(Math.cos(a)*65),p.z+Math.round(Math.sin(a)*65),p.y,55);
   if(target&&Math.hypot(target.x-p.x,target.z-p.z)>12)targets.push(target);
  }
  if(!targets.length)throw Error('NPC has no reachable fetch locations.');
  npcs.push({id:npcs.length,town:input.id,pony:pony.id,name:pony.name,...p,targets});
 }
 for(let i=0;i<3;i++){
  const angle=(i+.4)*Math.PI*2/3,p=world.nearby(pos.x+Math.round(Math.cos(angle)*(i?100:25)),pos.z+Math.round(Math.sin(angle)*(i?100:25)),pos.y,60);
  if(!p)throw Error('No town chest position: '+input.name);
  chests.push({id:chests.length,region:input.name,...p});
 }
}
// A deterministic spread across the real map. Each position has solid ground,
// empty headroom, and separation from the other treasure chests.
let seed=0x504f4e59;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let attempt=0;chests.length<50&&attempt<2000;attempt++){
 const x=Math.round(world.info.min.x+150+random()*(world.info.max.x-world.info.min.x-300)),z=Math.round(world.info.min.z+150+random()*(world.info.max.z-world.info.min.z-300));
 if(chests.some(c=>Math.hypot(c.x-x,c.z-z)<350))continue;
 const p=world.nearby(x,z,undefined,24,true);if(p)chests.push({id:chests.length,region:'Equestria wilds',...p});
}
if(chests.length!==50)throw Error('Unable to place all fifty chests on actual walkable terrain.');
const teleports=[];
for(const c of world.info.commands||[]){
 const match=/^execute at @[ap]\[dx=(-?\d+),dy=(-?\d+),dz=(-?\d+)\] run teleport @p (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)/.exec(c.command||'');
 if(!match)continue;
 const [,dx,dy,dz,tx,ty,tz]=match.map(Number);
 teleports.push({min:{x:Math.min(c.x,c.x+dx)-.5,y:Math.min(c.y,c.y+dy)-.5,z:Math.min(c.z,c.z-dz)-.5},max:{x:Math.max(c.x,c.x+dx)+.5,y:Math.max(c.y,c.y+dy)+.5,z:Math.max(c.z,c.z-dz)+.5},target:{x:tx-.5,y:ty-.5,z:-tz+.5}});
}
const result={format:1,worldHash:world.info.worldHash,towns,npcs,chests,teleports};
return result;
}
