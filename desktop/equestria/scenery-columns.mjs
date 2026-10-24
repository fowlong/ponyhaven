// Distant scenery retains the source's exact vertical intervals. Only X/Z are
// sampled more coarsely: a six-block roof never becomes an eight-block cube.
import {inflateSync} from 'node:zlib';

export function regionColumns(region,stateColours,step=2) {
 if(![1,2,4,8].includes(step))throw Error('Unsupported scenery footprint');
 const lo=region.readInt16LE(4),hi=region.readInt16LE(6),sections=hi-lo+1,height=sections*16;
 const side=16/step,width=512/step,columns=Array(width*width),colours=new Uint16Array(side*side*height);
 const votes=new Uint16Array(Math.max(...stateColours)+1),touched=new Uint16Array(step*step);
 for(let slot=0;slot<1024;slot++){
  colours.fill(0);let bottom=height,top=0;
  for(let sy=0;sy<sections;sy++){
   const at=32+(slot*sections+sy)*8,offset=region.readUInt32LE(at),length=region.readUInt32LE(at+4),start=sy*16*side*side;
   if(!length){const c=stateColours[offset];if(!c)continue;colours.fill(c,start,start+16*side*side);bottom=Math.min(bottom,sy*16);top=(sy+1)*16;continue;}
   const raw=inflateSync(region.subarray(offset,offset+length)),states=new Uint16Array(raw.buffer,raw.byteOffset,4096);
   for(let y=0;y<16;y++)for(let z=0;z<side;z++)for(let x=0;x<side;x++){
    let best=0,count=0,used=0;
    for(let dz=0;dz<step;dz++)for(let dx=0;dx<step;dx++){
     const c=stateColours[states[y*256+(z*step+dz)*16+x*step+dx]];if(!c)continue;
     if(!votes[c])touched[used++]=c;const n=++votes[c];if(n>count){best=c;count=n;}
    }
    for(let i=0;i<used;i++)votes[touched[i]]=0;
    if(best){colours[start+y*side*side+z*side+x]=best;bottom=Math.min(bottom,sy*16+y);top=Math.max(top,sy*16+y+1);}
   }
  }
  for(let z=0;z<side;z++)for(let x=0;x<side;x++){
   const runs=[];let colour=0,begin=bottom;
   for(let y=bottom;y<=top;y++){
    const c=y<top?colours[y*side*side+z*side+x]:0;
    if(c===colour)continue;if(colour)runs.push(begin,y,colour);colour=c;begin=y;
   }
   columns[(slot%32*side+x)+width*((slot>>5)*side+z)]=runs;
  }
 }
 return {columns,width,height,minY:lo*16,step};
}

// Intervals occupied by A but not B, keeping the exposed surface's own colour.
export function exposedIntervals(a,b){
 const out=[];let start=0;
 for(let i=0;i<a.length;i+=3){
  let y=a[i];const hi=a[i+1],c=a[i+2];while(start<b.length&&b[start+1]<=y)start+=3;
  for(let j=start;j<b.length&&b[j]<hi;j+=3){if(b[j]>y)out.push(y,Math.min(hi,b[j]),c);y=Math.max(y,b[j+1]);if(y>=hi)break;}
  if(y<hi)out.push(y,hi,c);
 }
 return out;
}

export function columnMesh({columns,width}) {
 const horizontal=new Map(),vertical=new Map(),quads=[];
 const face=(d,positive,plane,u0,u1,v0,v1,colour)=>{
  const u=(d+1)%3,v=(d+2)%3,a=[0,0,0];a[d]=plane;a[u]=u0;a[v]=v0;
  const b=[...a],c=[...a],e=[...a];b[u]=u1;c[u]=u1;c[v]=v1;e[v]=v1;
  quads.push({colour,face:d*2+(positive?0:1),vertices:positive?[a,b,c,e]:[a,e,c,b]});
 };
 const addHorizontal=(positive,y,x,z,colour)=>{
  const key=`${positive?1:0},${y},${colour}`;let group=horizontal.get(key);
  if(!group){group={positive,y,colour,cells:new Set()};horizontal.set(key,group);}group.cells.add(z+width*x);
 };
 const addVertical=(d,positive,plane,along,runs)=>{
  for(let i=0;i<runs.length;i+=3){const low=runs[i],high=runs[i+1],colour=runs[i+2],key=`${d},${positive?1:0},${plane},${low},${high},${colour}`;let group=vertical.get(key);
   if(!group){group={d,positive,plane,low,high,colour,spans:[]};vertical.set(key,group);}group.spans.push(along);
  }
 };
 for(let z=0;z<width;z++)for(let x=0;x<width;x++){
  const a=columns[x+width*z];
  for(let i=0;i<a.length;i+=3){
   if(i===0||a[i-2]!==a[i])addHorizontal(false,a[i],x,z,a[i+2]);
   if(i+3===a.length||a[i+3]!==a[i+1])addHorizontal(true,a[i+1],x,z,a[i+2]);
  }
  if(!x)addVertical(0,false,0,z,a);if(!z)addVertical(2,false,0,x,a);
  const east=x+1<width?columns[x+1+width*z]:[],south=z+1<width?columns[x+width*(z+1)]:[];
  addVertical(0,true,x+1,z,exposedIntervals(a,east));addVertical(0,false,x+1,z,exposedIntervals(east,a));
  addVertical(2,true,z+1,x,exposedIntervals(a,south));addVertical(2,false,z+1,x,exposedIntervals(south,a));
 }
 for(const {positive,y,colour,cells} of horizontal.values()){
  for(const at of [...cells].sort((a,b)=>a-b)){
   if(!cells.has(at))continue;const u=at%width,v=Math.floor(at/width);let w=1,h=1;
   while(u+w<width&&cells.has(at+w))w++;
   outer:while(v+h<width){for(let n=0;n<w;n++)if(!cells.has(at+n+h*width))break outer;h++;}
   for(let j=0;j<h;j++)for(let i=0;i<w;i++)cells.delete(at+i+j*width);
   face(1,positive,y,u,u+w,v,v+h,colour);
  }
 }
 for(const {d,positive,plane,low,high,colour,spans}of vertical.values()){
  spans.sort((a,b)=>a-b);let start=spans[0],end=start+1;
  const emit=()=>d===0?face(d,positive,plane,low,high,start,end,colour):face(d,positive,plane,start,end,low,high,colour);
  for(let i=1;i<spans.length;i++){if(spans[i]===end)end++;else{emit();start=spans[i];end=start+1;}}emit();
 }
 return quads;
}

// OBJ supports independent position/UV indices and quads. Reusing positions
// keeps the bundled ring small without changing a single surface coordinate.
export function sceneryOBJ(quads,{rx,rz,minY,step=2,textureWidth,textureHeight}){
 const positions=[],uv=[],faces=[],positionIds=new Map(),uvIds=new Map();
 for(const q of quads){
  const colour=q.colour*6+q.face;let ti=uvIds.get(colour);
  if(!ti){ti=uv.length+1;uvIds.set(colour,ti);uv.push(`vt ${((colour%textureWidth+.5)/textureWidth).toFixed(7)} ${(1-(Math.floor(colour/textureWidth)+.5)/textureHeight).toFixed(7)}`);}
  const ids=q.vertices.map(p=>{
   const line=`v ${-(rx*512+p[0]*step-.5)*10} ${(minY+p[1]-.5)*10} ${-(rz*512+p[2]*step-.5)*10}`;let id=positionIds.get(line);
   if(!id){id=positions.length+1;positions.push(line);positionIds.set(line,id);}return `${id}/${ti}/1`;
  });faces.push('f '+ids.join(' '));
 }
 return '# Source-height scenery: native world projection; normal length 3 is the scenery marker.\nvn 0 3 0\n'+positions.join('\n')+'\n'+uv.join('\n')+'\n'+faces.join('\n')+'\n';
}
