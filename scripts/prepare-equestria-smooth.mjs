import fs from 'node:fs/promises';
import path from 'node:path';
const mod=path.resolve('native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven');
await fs.mkdir(path.join(mod,'models'),{recursive:true});
const variants=[];
for(let a=0;a<5;a++)for(let b=0;b<5;b++)for(let c=0;c<5;c++)for(let d=0;d<5;d++){
 const key=`${a}${b}${c}${d}`,h=[a,b,c,d].map(n=>n*.5-.5);
 const verts=[[-.5,h[0],-.5],[.5,h[1],-.5],[.5,h[2],.5],[-.5,h[3],.5],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]];
 const faces=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[4,1,5],[4,0,1],[5,2,6],[5,1,2],[6,3,7],[6,2,3],[7,0,4],[7,3,0]];
 let obj='# Ponyhaven terrain; original mesh\n',index=1;
 for(const tri of faces){
  const [p,q,r]=tri.map(i=>verts[i]),u=q.map((v,i)=>v-p[i]),v=r.map((n,i)=>n-p[i]);
  let normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal);
  if(!length)continue;normal=normal.map(n=>n/length);
  for(const point of [p,q,r]){obj+=`v ${point.join(' ')}\nvt ${point[0]+.5} ${point[2]+.5}\nvn ${normal.join(' ')}\n`;}
  obj+=`f ${index}/${index}/${index} ${index+1}/${index+1}/${index+1} ${index+2}/${index+2}/${index+2}\n`;index+=3;
 }
 const boxes=[],height=(u,v)=>v<=u?h[0]+(h[1]-h[0])*u+(h[2]-h[1])*v:h[0]+(h[2]-h[3])*u+(h[3]-h[0])*v;
 for(let x=0;x<4;x++)for(let z=0;z<4;z++){
  const top=Math.max(height(x/4,z/4),height((x+1)/4,z/4),height(x/4,(z+1)/4),height((x+1)/4,(z+1)/4));
  if(top>-.5)boxes.push([x/4-.5,-.5,z/4-.5,(x+1)/4-.5,top,(z+1)/4-.5]);
 }
 const mesh=`eq_terrain_${key}.obj`;await fs.writeFile(path.join(mod,'models',mesh),obj);variants.push({key,mesh,boxes});
}
await fs.writeFile(path.join(mod,'smooth.json'),JSON.stringify(variants));
console.log('Prepared 625 terrain meshes and matching conservative quarter-block collision cells.');
