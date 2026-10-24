// SurfaceNets-style cell tiles, informed by NoCubes 38904f7 (SurfaceNets.java).
// One vertex averages the 12 cube-edge crossings, without a preferred diagonal.
// Luanti's fixed node meshes require face-boundary subdivisions instead of the
// reference renderer's quads spanning four cells. Shared boundaries are exact.
export const corners=Array.from({length:8},(_,i)=>[i&1,(i>>1)&1,(i>>2)&1]);
const edges=[];for(let i=0;i<8;i++)for(const bit of [1,2,4])if(!(i&bit))edges.push([i,i|bit]);
const faces=[[0,1,3,2],[4,5,7,6],[0,1,5,4],[2,3,7,6],[0,2,6,4],[1,3,7,5]];
const sub=(a,b)=>a.map((n,i)=>n-b[i]);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
const mean=a=>[0,1,2].map(i=>a.reduce((s,p)=>s+p[i],0)/a.length);
const unit=a=>a.map(n=>n/(Math.hypot(...a)||1));
export function surfaceTile(mask){
 const filled=i=>!!(mask&(1<<i));
 const crossing=([a,b])=>({p:mean([corners[a],corners[b]]),n:sub(corners[filled(a)?b:a],corners[filled(a)?a:b])});
 const cuts=edges.filter(([a,b])=>filled(a)!==filled(b)).map(crossing);
 if(!cuts.length)return {mask,triangles:[],boxes:mask===255?[[-.5,-.5,-.5,.5,.5,.5]]:[]};
 const center=mean(cuts.map(c=>c.p)),triangles=[],bottom=[];
 for(const face of faces){
  const segments=[];const hits=face.map((a,i)=>{const b=face[(i+1)%4];return filled(a)!==filled(b)?crossing([a,b]):null;});
  const present=hits.filter(Boolean);
  if(present.length===2)segments.push(present);
  // Checkerboard faces use the same decision from either neighbouring cell.
  else if(present.length===4)for(let i=0;i<4;i++)if(filled(face[i]))segments.push([hits[(i+3)%4],hits[i]]);
  for(const [a,b]of segments){
   if(face===faces[2])bottom.push([a.p,b.p]);
   const tri=[center,a.p,b.p];let normal=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0]));
   if(Math.hypot(...normal)<1e-9)continue;
   if(dot(normal,a.n.map((n,i)=>n+b.n[i]))<0){[tri[1],tri[2]]=[tri[2],tri[1]];normal=normal.map(n=>-n);}
   triangles.push({vertices:tri,normal:unit(normal)});
  }
 }
 // Sample the material behind the surface, as NoCubes' MeshRenderer does.
 const normal=unit(cuts.reduce((a,c)=>a.map((v,i)=>v+c.n[i]),[0,0,0]));
 const sample=center.map((v,i)=>v-normal[i]*.5);
 const materialCandidates=corners.map((_,i)=>i).filter(filled).sort((a,b)=>dot(sub(corners[a],sample),sub(corners[a],sample))-dot(sub(corners[b],sample),sub(corners[b],sample)));
 // Quarter-node collision columns derived from the actual rendered triangles.
 const boxes=[];
 for(let ix=0;ix<4;ix++)for(let iz=0;iz<4;iz++){
  const x=(ix+.5)/4,z=(iz+.5)/4;let inside=filled(z<.5?0:4);
  for(const [a,b]of bottom)if((a[2]>z)!==(b[2]>z)){
   const hit=a[0]+(z-a[2])*(b[0]-a[0])/(b[2]-a[2]);if(hit>1e-8&&hit<x)inside=!inside;
  }
  const heights=[];
  for(const {vertices:[a,b,c],normal:n}of triangles){
   if(Math.abs(n[1])<1e-8)continue;
   const y=a[1]-(n[0]*(x-a[0])+n[2]*(z-a[2]))/n[1];if(y<=1e-8||y>=1-1e-8)continue;
   const p=[x,y,z],ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d00=dot(ab,ab),d01=dot(ab,ac),d11=dot(ac,ac),d20=dot(ap,ab),d21=dot(ap,ac),den=d00*d11-d01*d01;
   const u=(d11*d20-d01*d21)/den,v=(d00*d21-d01*d20)/den;
   if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7&&!heights.some(h=>Math.abs(h-y)<1e-7))heights.push(y);
  }
  heights.sort((a,b)=>a-b);let start=-1,at=0;
  for(let iy=0;iy<=4;iy++){
   while(at<heights.length&&heights[at]<(iy+.5)/4){inside=!inside;at++;}
   const solid=iy<4&&inside;
   if(solid&&start<0)start=iy;
   if(!solid&&start>=0){boxes.push([ix/4,start/4,iz/4,(ix+1)/4,iy/4,(iz+1)/4]);start=-1;}
  }
 }
 return {mask,center,materialCandidates,triangles,boxes};
}
export function surfaceUV(p,n){
 // Coplanar bevel triangles can differ by floating-point epsilon. A raw max
 // then projects each triangle along a different axis, twisting brick/grain
 // patterns across a single face. Quantize only the axis decision.
 const strength=n.map(v=>Math.round(Math.abs(v)*1e6));
 const axis=strength.indexOf(Math.max(...strength)),axes=axis===0?[2,1]:axis===1?[0,2]:[0,1];
 return axes.map(i=>p[i]);
}
export function surfaceOBJ(tile){
 let obj='# SurfaceNets cell tile; OBJ handedness compensated for Irrlicht\n',index=1;
 for(const {vertices,normal:n}of tile.triangles){
  for(const p of [...vertices].reverse()){const uv=surfaceUV(p,n);obj+=`v ${-p[0]} ${p[1]} ${p[2]}\nvt ${uv[0]} ${1-uv[1]}\nvn ${-n[0]} ${n[1]} ${n[2]}\n`;}
  obj+=`f ${index}/${index}/${index} ${index+1}/${index+1}/${index+1} ${index+2}/${index+2}/${index+2}\n`;index+=3;
 }
 return obj;
}
