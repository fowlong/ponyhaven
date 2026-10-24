// Coarse 3D occupancy, rather than a height map: roofs, walls, bridges and
// floating islands keep their volume. Each cell retains its dominant colour.
import {inflateSync} from 'node:zlib';

export function regionGrid(region, stateColours, colourCount) {
 const lo=region.readInt16LE(4),hi=region.readInt16LE(6),height=hi-lo+1;
 const size=[64,height*2,64],data=new Uint16Array(size[0]*size[1]*size[2]);
 const counts=new Uint16Array(colourCount*8),best=new Uint16Array(8),votes=new Uint16Array(8);
 for(let slot=0;slot<1024;slot++)for(let sy=0;sy<height;sy++) {
  const at=32+(slot*height+sy)*8,offset=region.readUInt32LE(at),length=region.readUInt32LE(at+4);
  best.fill(0);votes.fill(0);
  if(!length)best.fill(stateColours[offset]);
  else {
   counts.fill(0);const raw=inflateSync(region.subarray(offset,offset+length));
   const states=new Uint16Array(raw.buffer,raw.byteOffset,4096);
   for(let i=0;i<4096;i++) {
    const c=stateColours[states[i]];if(!c)continue;
    const cell=((i>>3)&1)|((i>>6)&2)|((i>>9)&4),count=++counts[cell*colourCount+c];
    if(count>votes[cell]){votes[cell]=count;best[cell]=c;}
   }
  }
  for(let n=0;n<8;n++) {
   const x=(slot%32)*2+(n&1),y=sy*2+(n>>2),z=(slot>>5)*2+((n>>1)&1);
   data[x+size[0]*(y+size[1]*z)]=best[n];
  }
 }
 return {size,data,minY:lo*16,step:8};
}

export function reduceGrid(grid,factor,colourCount) {
 const size=grid.size.map(n=>n/factor),data=new Uint16Array(size[0]*size[1]*size[2]),counts=new Uint16Array(colourCount);
 for(let z=0;z<size[2];z++)for(let y=0;y<size[1];y++)for(let x=0;x<size[0];x++) {
  counts.fill(0);let best=0,votes=0;
  for(let dz=0;dz<factor;dz++)for(let dy=0;dy<factor;dy++)for(let dx=0;dx<factor;dx++) {
   const c=grid.data[x*factor+dx+grid.size[0]*(y*factor+dy+grid.size[1]*(z*factor+dz))];
   if(c&&++counts[c]>votes){best=c;votes=counts[c];}
  }
  data[x+size[0]*(y+size[1]*z)]=best;
 }
 return {size,data,minY:grid.minY,step:grid.step*factor};
}

// Merge adjacent exposed faces with the same colour into rectangles. Internal
// material boundaries emit no geometry; work is bounded by the coarse grid.
export function meshGrid({size,data}) {
 const quads=[],stride=[1,size[0],size[0]*size[1]],p=[0,0,0];
 for(let d=0;d<3;d++) {
  const u=(d+1)%3,v=(d+2)%3,w=size[u],h=size[v],mask=new Int32Array(w*h);
  for(let plane=0;plane<=size[d];plane++) {
   for(let j=0;j<h;j++)for(let i=0;i<w;i++) {
    p[d]=plane;p[u]=i;p[v]=j;const at=p[0]+p[1]*stride[1]+p[2]*stride[2];
    const a=plane?data[at-stride[d]]:0,b=plane<size[d]?data[at]:0;
    mask[i+j*w]=a&&!b?a:b&&!a?-b:0;
   }
   for(let j=0;j<h;j++)for(let i=0;i<w;) {
    const value=mask[i+j*w];if(!value){i++;continue;}
    let rw=1,rh=1;while(i+rw<w&&mask[i+rw+j*w]===value)rw++;
    outer:while(j+rh<h){for(let n=0;n<rw;n++)if(mask[i+n+(j+rh)*w]!==value)break outer;rh++;}
    const a=[0,0,0];a[d]=plane;a[u]=i;a[v]=j;
    const b=[...a],c=[...a],e=[...a];b[u]+=rw;c[u]+=rw;c[v]+=rh;e[v]+=rh;
    quads.push({colour:Math.abs(value),face:d*2+(value>0?0:1),vertices:value>0?[a,b,c,e]:[a,e,c,b]});
    for(let y=0;y<rh;y++)mask.fill(0,(j+y)*w+i,(j+y)*w+i+rw);i+=rw;
   }
  }
 }
 return quads;
}

export function objTextureCoordinates(width,height) {
 return Array.from({length:width*height},(_,i)=>`vt ${((i%width+.5)/width).toFixed(7)} ${(1-(Math.floor(i/width)+.5)/height).toFixed(7)}`).join('\n')+'\n';
}

export function objMesh(quads,{rx=0,rz=0,minY=0,step=8,marker=3,start=0}={}) {
 const lines=[],origin=[rx*512-.5,minY-.5,rz*512-.5],scale=Array.isArray(step)?step:[step,step,step];let index=start;
 for(const q of quads) {
  const texture=q.colour*6+q.face+1;
  // Source Z is reversed in Luanti. OBJ X is reversed again by its loader;
  // its importer also reverses winding and V. Account for all three here.
  for(const p of q.vertices){const a=p.map((n,i)=>(origin[i]+n*scale[i])*10);lines.push(`v ${-a[0]} ${a[1]} ${-a[2]}`);}
  lines.push(`f ${index+1}/${texture}/1 ${index+2}/${texture}/1 ${index+3}/${texture}/1`,`f ${index+1}/${texture}/1 ${index+3}/${texture}/1 ${index+4}/${texture}/1`);index+=4;
 }
 return {text:lines.join('\n')+'\n',vertices:index-start,triangles:quads.length*2,marker};
}
