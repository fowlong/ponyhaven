// Mild edge softening for close-range voxels: a full cube with small 45° chamfers
// on exposed convex edges only. Heights, footprints and collision never change.
// Writes models/eq_bevel_*.obj and bevels.json into the bundled game mod.
import fs from 'node:fs/promises';
import path from 'node:path';
const mod=path.resolve('native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven');
// Chamfer depth in blocks: 3/16 is three texels of a 16px texture.
export const BEVEL=3/16;
// Side bits in Luanti coordinates, cyclic so neighbouring bits share a corner.
export const SIDES=[[1,0],[0,1],[-1,0],[0,-1]]; // +x, +z, -x, -z
const EPS=1e-7;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const l=Math.hypot(...a);return a.map(n=>n/l);};
// Which chamfers a neighbourhood gets: top edges need open air above and beside;
// vertical edges need both adjacent sides open. Returns null for a plain cube.
export function bevelPlanes(top,sides){
 const planes=[];
 for(let i=0;i<4;i++){
  const [sx,sz]=SIDES[i];if(!(sides>>i&1))continue;
  if(top)planes.push({n:unit([sx,1,sz]),d:(1-BEVEL)/Math.SQRT2});
  const j=(i+1)%4,[tx,tz]=SIDES[j];
  if(sides>>j&1)planes.push({n:unit([sx+tx,0,sz+tz]),d:(1-BEVEL)/Math.SQRT2});
 }
 return planes.length?planes:null;
}
function clip(poly,{n,d}){
 const out=[],cut=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],da=dot(n,a)-d,db=dot(n,b)-d;
  if(da<=EPS)out.push(a);
  if((da<-EPS&&db>EPS)||(da>EPS&&db<-EPS)){const t=da/(da-db),p=a.map((v,k)=>v+(b[k]-v)*t);out.push(p);cut.push(p);}
  else if(Math.abs(da)<=EPS)cut.push(a);
 }
 return {poly:out,cut};
}
// Convex polyhedron = unit cube ∩ chamfer half-spaces. Each polygon keeps its
// outward normal; caps are rebuilt from the clipped edges of every face.
export function bevelPolyhedron(planes){
 const h=.5,faces=[
  {n:[1,0,0],p:[[h,-h,-h],[h,h,-h],[h,h,h],[h,-h,h]]},{n:[-1,0,0],p:[[-h,-h,-h],[-h,-h,h],[-h,h,h],[-h,h,-h]]},
  {n:[0,1,0],p:[[-h,h,-h],[-h,h,h],[h,h,h],[h,h,-h]]},{n:[0,-1,0],p:[[-h,-h,-h],[h,-h,-h],[h,-h,h],[-h,-h,h]]},
  {n:[0,0,1],p:[[-h,-h,h],[h,-h,h],[h,h,h],[-h,h,h]]},{n:[0,0,-1],p:[[-h,-h,-h],[-h,h,-h],[h,h,-h],[h,-h,-h]]}];
 let polys=faces.map(f=>({n:f.n,p:f.p}));
 for(const plane of planes){
  const next=[],points=[];
  for(const f of polys){const {poly,cut}=clip(f.p,plane);points.push(...cut);if(poly.length>=3)next.push({n:f.n,p:poly});}
  const unique=[];for(const p of points)if(!unique.some(q=>Math.hypot(...sub(p,q))<1e-6))unique.push(p);
  if(unique.length>=3){
   const c=unique.reduce((s,p)=>s.map((v,k)=>v+p[k]/unique.length),[0,0,0]);
   const u=unit(sub(unique[0],c)),v=cross(plane.n,u);
   unique.sort((a,b)=>Math.atan2(dot(sub(a,c),v),dot(sub(a,c),u))-Math.atan2(dot(sub(b,c),v),dot(sub(b,c),u)));
   next.push({n:plane.n,p:unique});
  }
  polys=next;
 }
 // Drop slivers and repeated vertices left by touching planes.
 return polys.map(f=>({n:f.n,p:f.p.filter((q,i,a)=>Math.hypot(...sub(q,a[(i+1)%a.length]))>1e-6)})).filter(f=>f.p.length>=3);
}
// Luanti's cuboid UV convention (generateCuboidTextureCoords), so chamfered
// faces line up with neighbouring cubes. v is measured from the image top.
function uv([x,y,z],n){
 const [ax,ay,az]=n.map(Math.abs);
 if(ay>=Math.max(ax,az)-1e-6)return n[1]>0?[x+.5,.5-z]:[x+.5,z+.5];
 if(ax>=az)return n[0]>0?[z+.5,.5-y]:[.5-z,.5-y];
 return n[2]>0?[.5-x,.5-y]:[x+.5,.5-y];
}
// Irrlicht's OBJ loader mirrors X and reverses winding; write in OBJ space so
// the loaded mesh matches Luanti coordinates with outward-facing triangles.
export function bevelOBJ(polys){
 let v='',t='',nrm='',f='',index=1;
 for(const face of polys){
  let pts=face.p;const objN=[-face.n[0],face.n[1],face.n[2]],obj=p=>[-p[0],p[1],p[2]];
  const a=obj(pts[0]),b=obj(pts[1]),c=obj(pts[2]);if(dot(cross(sub(b,a),sub(c,a)),objN)<0)pts=[...pts].reverse();
  const ids=[];
  for(const p of pts){const q=obj(p),[s,w]=uv(p,face.n);v+=`v ${q.map(n=>+n.toFixed(6)).join(' ')}\n`;t+=`vt ${+s.toFixed(6)} ${+(1-w).toFixed(6)}\n`;nrm+=`vn ${objN.map(n=>+n.toFixed(6)).join(' ')}\n`;ids.push(`${index}/${index}/${index}`);index++;}
  f+=`f ${ids.join(' ')}\n`;
 }
 return '# Ponyhaven mild bevel: full cube, chamfered exposed edges only.\n'+v+t+nrm+f;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname.slice(1))){
 const variants=[];
 for(let top=0;top<2;top++)for(let sides=0;sides<16;sides++){
  const planes=bevelPlanes(top,sides);if(!planes)continue;
  const key=`${top}${sides.toString(16)}`,mesh=`eq_bevel_${key}.obj`,polys=bevelPolyhedron(planes);
  await fs.writeFile(path.join(mod,'models',mesh),bevelOBJ(polys));
  variants.push({key,top,sides,mesh,faces:polys.length});
 }
 await fs.writeFile(path.join(mod,'bevels.json'),JSON.stringify({bevel:BEVEL,variants}));
 console.log(`Prepared ${variants.length} bevel meshes (chamfer ${BEVEL} blocks).`);
}
