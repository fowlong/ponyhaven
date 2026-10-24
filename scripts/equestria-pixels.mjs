import {deflateSync} from 'node:zlib';
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(data){let n=0xffffffff;for(const b of data)n=crcTable[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
function chunk(name,data){const type=Buffer.from(name),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);type.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([type,data])),out.length-4);return out;}
export function png(width,height,rgba){
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const pixels=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)Buffer.from(rgba.buffer,rgba.byteOffset+y*width*4,width*4).copy(pixels,y*(width*4+1)+1);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
export function doomPatch(data,palette){
 const w=data.readUInt16LE(0),h=data.readUInt16LE(2),left=data.readInt16LE(4),top=data.readInt16LE(6);
 if(w>2048||h>2048||data.length<8+w*4)throw Error('Invalid pony sprite patch.');
 const rgba=new Uint8Array(w*h*4);
 for(let x=0;x<w;x++){
  let at=data.readUInt32LE(8+x*4),previous=-1;
  while(data[at]!==255){const delta=data[at],n=data[at+1],y=delta<=previous?previous+delta:delta;previous=y;
   if(at+n+4>data.length)throw Error('Truncated pony sprite.');
   for(let i=0;i<n&&y+i<h;i++){const colour=data[at+3+i],p=((y+i)*w+x)*4;rgba[p]=palette[colour*3];rgba[p+1]=palette[colour*3+1];rgba[p+2]=palette[colour*3+2];rgba[p+3]=255;}at+=n+4;
  }
 }
 return {w,h,left,top,rgba};
}
