export const spellNames=['Risier','Fiera','Disperim','Sanium','Expol','Flurra','Fulst'];
const targets=[[.42,.38],[.78,.19],[.18,.24],[.36,.85],[.79,.75],[.12,.67],[.58,.62]];
export function scatteredBooks(world,towns=[],bosses=[]){
 const {min,max}=world.info,books=[];
 const offsets=[];for(let x=-18;x<=18;x++)for(let z=-18;z<=18;z++)offsets.push([x*64,z*64]);offsets.sort((a,b)=>a[0]**2+a[1]**2-b[0]**2-b[1]**2);
 for(let i=0;i<spellNames.length;i++){
  const [u,v]=targets[i],x=Math.round(min.x+(max.x-min.x)*u),z=Math.round(min.z+(max.z-min.z)*v);let chosen;
  for(const [dx,dz]of offsets){
   const px=x+dx,pz=z+dz;if(px<min.x+64||px>max.x-64||pz<min.z+64||pz>max.z-64)continue;
   if(books.some(p=>Math.hypot(p.x-px,p.z-pz)<1400)||towns.some(p=>Math.hypot(p.x-px,p.z-pz)<160)||bosses.some(p=>Math.hypot(p.x-px,p.z-pz)<180))continue;
   const p=world.surface(px,pz,undefined,true);if(!p||p.y<min.y+8)continue;
   if([[0,0],[-1,0],[1,0],[0,-1],[0,1]].some(([sx,sz])=>[1,2].some(dy=>{const m=world.material(px+sx,p.y+dy,pz+sz);return m.solid||m.shape==='liquid';})))continue;
   chosen=p;break;
  }
  if(!chosen)throw Error('No accessible, separated location for '+spellNames[i]);
  books.push({id:i+1,name:spellNames[i],...chosen});
 }
 return books;
}
