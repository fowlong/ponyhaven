import test from 'node:test';
import assert from 'node:assert/strict';
import {surfaceTile,surfaceOBJ,surfaceUV,cross,dot} from '../desktop/equestria/surface-nets.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('coplanar bevels keep the same texture projection despite floating-point ties',()=>{
 for(let mask=1;mask<255;mask++){
  const projections=new Map();
  for(const {normal}of surfaceTile(mask).triangles){
   const plane=normal.map(n=>Math.round(n*1e6)).join(','),uv=surfaceUV([.21,.43,.67],normal);
   if(projections.has(plane))assert.deepEqual(uv,projections.get(plane),`Texture projection changed across coplanar triangles in mask ${mask}`);
   projections.set(plane,uv);
  }
 }
});
test('NoCubes-style vertices average twelve edge crossings without tetrahedron bias',()=>{
 surfaceTile(1).center.forEach(n=>close(n,1/6));
 surfaceTile(128).center.forEach(n=>close(n,5/6));
 assert.deepEqual(surfaceTile(15).center,[.5,.5,.5]);
 for(let mask=1;mask<255;mask++){
  const tile=surfaceTile(mask),inverse=surfaceTile(255-mask);
  tile.center.forEach((n,i)=>close(n,inverse.center[i]));
  assert.ok(tile.materialCandidates.every(c=>mask&(1<<c)),'Material must come from a solid source corner');
  assert.ok(tile.triangles.length>0);
 }
});
test('exported OBJ survives Irrlicht X mirroring and winding reversal',()=>{
 for(let mask=1;mask<255;mask++){
  const tile=surfaceTile(mask),vertices=[],normals=[],faces=[];
  for(const line of surfaceOBJ(tile).split('\n')){
   const [kind,...data]=line.split(' ');
   if(kind==='v'||kind==='vn'){const v=data.map(Number);v[0]*=-1;(kind==='v'?vertices:normals).push(v);}
   if(kind==='f')faces.push(data.map(v=>Number(v.split('/')[0])-1).reverse());
  }
  faces.forEach((f,i)=>{
   const p=f.map(n=>vertices[n]);p.forEach((v,j)=>v.forEach((n,k)=>close(n,tile.triangles[i].vertices[j][k])));
   const ab=p[1].map((n,k)=>n-p[0][k]),ac=p[2].map((n,k)=>n-p[0][k]);
   assert.ok(dot(cross(ab,ac),normals[f[0]])>0,'Imported face and normal disagree');
   p.flat().forEach(n=>assert.ok(n>=-1e-7&&n<=1+1e-7,'Mesh escaped its intended cell'));
  });
 }
});
test('neighbouring cells share boundary segments regardless of their far corners',()=>{
 const segment=(t,x)=>t.triangles.flatMap(({vertices})=>{
  const p=vertices.filter(p=>Math.abs(p[0]-x)<1e-8);return p.length===2?[p.map(p=>p.slice(1).map(n=>n.toFixed(6)).join(',')).sort().join('|')]:[];
 }).sort();
 for(let face=0;face<16;face++){
  let left=0,right=0;for(let i=0;i<4;i++){if(face&(1<<i)){left|=1<<(i*2+1);right|=1<<(i*2);}}
  const a=segment(surfaceTile(left),1);
  for(let far=0;far<16;far++){
   let mask=right;for(let i=0;i<4;i++)if(far&(1<<i))mask|=1<<(i*2+1);
   assert.deepEqual(segment(surfaceTile(mask),0),a);
  }
 }
});
