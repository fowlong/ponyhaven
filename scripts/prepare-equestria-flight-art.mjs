// Deterministic 64×64 effect art: unarmed right-click projectiles
// (eq_cloud_orb.png for pegasi, eq_dirt_orb.png for earth ponies) and the
// Friendship Emergency heart marker (eq_emergency.png).
import fs from 'node:fs/promises';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
const textures=path.resolve('native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven/textures');
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc=b=>{let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
function chunk(type,data){const out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);out.write(type,4,'ascii');data.copy(out,8);out.writeUInt32BE(crc(out.subarray(4,8+data.length)),8+data.length);return out;}
function png(size,pixel){
 const raw=Buffer.alloc((size*4+1)*size);
 for(let y=0;y<size;y++){raw[y*(size*4+1)]=0;for(let x=0;x<size;x++){const [r,g,b,a]=pixel(x+.5,y+.5).map(v=>Math.max(0,Math.min(255,Math.round(v))));raw.set([r,g,b,a],y*(size*4+1)+1+x*4);}}
 const head=Buffer.alloc(13);head.writeUInt32BE(size,0);head.writeUInt32BE(size,4);head[8]=8;head[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
const hash=(x,y,s)=>{let h=Math.imul(x*374761393+y*668265263+s*2147483647|0,1274126177);h^=h>>>13;h=Math.imul(h,1103515245);return ((h^h>>>16)>>>0)/4294967296;};
const smooth=(e0,e1,x)=>{const t=Math.max(0,Math.min(1,(x-e0)/(e1-e0)));return t*t*(3-2*t);};
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
// Cloud: union of soft puffs, bright on top, cool grey underneath.
const puffs=[[32,36,15],[20,38,11],[44,38,11],[26,27,11],[39,26,12],[32,44,12]];
const cloud=png(64,(x,y)=>{
 let field=0;for(const [cx,cy,r] of puffs)field=Math.max(field,1-Math.hypot(x-cx,y-cy)/r);
 const alpha=smooth(0,.12,field);if(alpha<=0)return [0,0,0,0];
 const shade=smooth(18,50,y),rim=1-smooth(.05,.35,field);
 const c=mix([255,255,255],[196,210,232],shade*.85);
 return [...mix(c,[176,192,222],rim*.35),255*alpha];
});
// Dirt clod: shaded ball with dark specks and a few small pebbles.
const pebbles=[[24,26,3.2],[40,37,2.6],[30,44,2.2],[43,24,2]];
const dirt=png(64,(x,y)=>{
 const d=Math.hypot(x-32,y-32)/23+(hash(Math.floor(x/3),Math.floor(y/3),7)-.5)*.08;
 const alpha=1-smooth(.92,1.02,d);if(alpha<=0)return [0,0,0,0];
 const light=Math.max(0,1-Math.hypot(x-24,y-23)/34);
 let c=mix([92,58,34],[168,118,72],light);
 const n=hash(Math.floor(x/2),Math.floor(y/2),3);if(n<.16)c=mix(c,[62,38,22],.7);else if(n>.9)c=mix(c,[196,150,98],.45);
 for(const [px,py,r] of pebbles){const pd=Math.hypot(x-px,y-py)/r;if(pd<1)c=mix([150,146,138],[208,204,196],Math.max(0,1-Math.hypot(x-px+r*.4,y-py+r*.4)/r));}
 return [...mix(c,[52,32,18],smooth(.75,1,d)*.6),255*alpha];
});
// Emergency heart: two lobes and a point, a white rim and a white "!".
const inHeart=(x,y)=>{
 if(Math.hypot(x-22,y-23)<12.5||Math.hypot(x-42,y-23)<12.5)return true;
 const t=(y-25)/(57-25);return y>=25&&y<=57&&Math.abs(x-32)<=(1-t)*21.5;
};
const heart=png(64,(x,y)=>{
 if(!inHeart(x,y))return [0,0,0,0];
 const rim=[0,1,2,3,4,5,6,7].some(i=>!inHeart(x+Math.cos(i*Math.PI/4)*2.6,y+Math.sin(i*Math.PI/4)*2.6));
 const bang=(Math.abs(x-32)<3.2&&y>14&&y<34)||Math.hypot(x-32,y-41)<3.4;
 if(rim||bang)return [255,255,255,255];
 return [...mix([255,128,196],[214,40,120],smooth(10,54,y)),255];
});
for(const [name,data] of [['eq_cloud_orb.png',cloud],['eq_dirt_orb.png',dirt],['eq_emergency.png',heart]])await fs.writeFile(path.join(textures,name),data);
console.log('Prepared projectile and Friendship Emergency textures.');
