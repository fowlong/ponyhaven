// Original combat textures and synthesized audio; no external music samples.
import fs from 'node:fs/promises';
import path from 'node:path';
// Build-only encoder, fetched from its official npm tarball into tmp/equestria.
import {createOggEncoder} from '../tmp/equestria/encoder/package/dist/esnext/index.mjs';
import {png} from './equestria-pixels.mjs';
const mod=path.resolve('native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven');
const encoder=await createOggEncoder();
await fs.mkdir(path.join(mod,'sounds'),{recursive:true});await fs.mkdir('tmp/equestria/audio',{recursive:true});
async function texture(name,w,h,fn){const data=new Uint8Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(fn(x,y),(y*w+x)*4);await fs.writeFile(path.join(mod,'textures',name+'.png'),png(w,h,data));}
for(let n=0;n<=20;n++)await texture('eq_health_'+n,64,8,(x,y)=>x<1||x>62||y<1||y>6?[35,29,52,245]:x<1+62*n/20?[255,106+Math.floor(70*n/20),157,255]:[58,45,75,220]);
await texture('eq_dark_orb',64,64,(x,y)=>{const r=Math.hypot(x-31.5,y-31.5)/31;return r>1?[0,0,0,0]:[12+Math.round(75*r**5),8+Math.round(35*r**5),20+Math.round(100*r**5),Math.round(255*Math.min(1,(1-r)*6))];});
await texture('eq_area',64,64,(x,y)=>{const r=Math.hypot(x-31.5,y-31.5)/31;return [255,255,255,r>1?0:Math.round(45*(1-r)+190*Math.max(0,1-Math.abs(r-.87)/.1))];});
await texture('eq_quest_done',64,64,(x,y)=>{const dx=(x-31.5)/31,dy=(y-31.5)/31,r=Math.hypot(dx,dy);const exclamation=(Math.abs(dx)<.12&&dy>-.65&&dy<.25)||(Math.abs(dx)<.13&&dy>.4&&dy<.62);return [57,255,102,exclamation?255:Math.round(Math.max(0,1-r)*60)];});
await fs.writeFile(path.join(mod,'models/eq_area.obj'),'# Ground area indicator, native mesh units\nv 10 0 -10\nv -10 0 -10\nv -10 0 10\nv 10 0 10\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nvn 0 1 0\nf 3/3/1 2/2/1 1/1/1\nf 4/4/1 3/3/1 1/1/1\n');
let seed=0x50484d55;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296*2-1;};
const tau=Math.PI*2,rate=32000;
const sounds={
 piano:{seconds:4,fn:t=>{const f=261.6256;return (Math.sin(tau*f*t)+.32*Math.sin(tau*f*2.002*t)*Math.exp(-t*2)+.12*Math.sin(tau*f*3*t)*Math.exp(-t*4))*Math.exp(-t*1.25)*(1-Math.exp(-t*180))*.48;}},
 bass:{seconds:1.6,fn:t=>(Math.sin(tau*65.4064*t)+.16*Math.sin(tau*130.8128*t))*Math.exp(-t*2.8)*(1-Math.exp(-t*90))*.68},
 kick:{seconds:.42,fn:t=>Math.sin(tau*(48*t+1.9*(1-Math.exp(-t*30))))*Math.exp(-t*13)*.78},
 snare:{seconds:.23,fn:t=>(random()*.6+Math.sin(tau*180*t)*.2)*Math.exp(-t*22)},
 hat:{seconds:.11,fn:t=>random()*Math.exp(-t*60)*.28},
 slash:{seconds:.32,fn:t=>random()*Math.sin(Math.PI*t/.32)**2*.45},
 orb:{seconds:.38,fn:t=>(Math.sin(tau*(370*t-280*t*t))+.2*Math.sin(tau*740*t))*Math.sin(Math.PI*t/.38)*.5},
 spell:{seconds:.8,fn:t=>(Math.sin(tau*523.25*t)+Math.sin(tau*659.25*t)+Math.sin(tau*783.99*t))*.2*Math.exp(-t*4)*(1-Math.exp(-t*140))},
 warning:{seconds:.9,fn:t=>(Math.sin(tau*(90*t+60*t*t))+.4*Math.sin(tau*95.3*t))*.34*Math.sin(Math.PI*t/.9)},
 impact:{seconds:.6,fn:t=>(Math.sin(tau*(48*t+1.1*(1-Math.exp(-t*20))))*.6+random()*.34)*Math.exp(-t*9)},
 boss:{seconds:1.1,fn:t=>(Math.sin(tau*73.42*t)+.5*Math.sin(tau*77.78*t)+random()*.25)*.4*Math.exp(-t*3)*(1-Math.exp(-t*150))}
};
for(const [name,spec]of Object.entries(sounds)){
 const length=Math.ceil(spec.seconds*rate),data=Buffer.alloc(44+length*2);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(length*2,40);
 let peak=0;for(let i=0;i<length;i++){const sample=spec.fn(i/rate)*Math.min(1,(length-i)/320);peak=Math.max(peak,Math.abs(sample));if(Math.abs(sample)>1)throw Error('Audio clipping: '+name);data.writeInt16LE(Math.round(sample*32767),44+i*2);}
 const input=path.resolve('tmp/equestria/audio/'+name+'.wav');await fs.writeFile(input,data);
 encoder.configure({sampleRate:rate,channels:1,vbrQuality:4});
 const samples=Float32Array.from({length},(_,i)=>data.readInt16LE(44+i*2)/32768);
 const encoded=Buffer.from(encoder.encode([samples])),tail=Buffer.from(encoder.finalize());
 await fs.writeFile(path.join(mod,'sounds','eq_'+name+'.ogg'),Buffer.concat([encoded,tail]));
 console.log(name+': '+spec.seconds+'s, peak '+peak.toFixed(3));
}
