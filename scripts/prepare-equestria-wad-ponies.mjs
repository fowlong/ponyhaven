// Adds SRB2 2.1 character WADs to Equestria's pony atlases (ponies.json), in the
// same 8-direction, fixed-canvas layout as prepare-equestria-ponies.mjs.
// 2.1 skins use one sprite prefix with frame letters per state; the letter table
// matches the original conversion in prepare-native-assets.py (SPR2), and the
// legacy 2.1 palette keeps the original colours.
import fs from 'node:fs/promises';
import path from 'node:path';
import {png,doomPatch} from './equestria-pixels.mjs';
const mod=path.resolve('native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven');
// Pinkie's 2.0 sprites draw her mane with the legacy dusty-rose ramp (144-151);
// remap just that ramp to her hot pink (#ED458B). Rainbow Dash needs no changes.
const hotPink=[[255,160,205],[250,140,195],[245,115,180],[240,92,160],[237,69,141],[215,55,125],[196,40,108],[170,30,95]];
const sources=[['pinkiepie','tmp/pinkiepie.wad',Object.fromEntries(hotPink.map((rgb,i)=>[144+i,rgb]))],['rainbowdash','tmp/RainbowDash.wad',{}]];
const motions={idle:'A',walk:'DEFGHIJK',run:'QRST',roll:'LMNO',jump:'P',swim:'UV',fly:'UV',glide:'WXYZ',climb:'WXYZ',hurt:'\\'};
const legacy=await fs.readFile('engines/srb2-legacy.pal');
function lumps(data){
 const magic=data.toString('latin1',0,4);if(magic!=='PWAD'&&magic!=='IWAD')throw Error('Not a WAD');
 const count=data.readInt32LE(4),dir=data.readInt32LE(8),out=[];
 for(let i=0;i<count;i++){const o=dir+i*16;out.push({name:data.toString('latin1',o+8,o+16).replace(/\0.*$/s,''),data:data.subarray(data.readInt32LE(o),data.readInt32LE(o)+data.readInt32LE(o+4))});}
 return out;
}
const file=path.join(mod,'ponies.json'),output=JSON.parse(await fs.readFile(file,'utf8'));
for(const [id,source,recolour] of sources){
 const all=lumps(await fs.readFile(source));
 const colours=Buffer.from(legacy);for(const [index,rgb] of Object.entries(recolour))colours.set(rgb,Number(index)*3);
 const prefix=all.find(l=>l.name.length===6&&l.name.endsWith('A1'))?.name.slice(0,4);if(!prefix)throw Error('No sprites in '+source);
 const sprites=new Map(all.filter(l=>l.name.startsWith(prefix)&&(l.name.length===6||l.name.length===8)&&'012345678'.includes(l.name[5])).map(l=>[l.name.slice(4),l.data]));
 output[id]={};
 for(const [motion,letters] of Object.entries(motions)){
  let frames=[...letters].filter(f=>[...sprites.keys()].some(k=>k[0]===f||k[2]===f));if(!frames.length)frames=['A'];
  // Rotation r (1-8) is either its own lump, the mirrored half of a paired lump
  // (e.g. "A2A8" serves 2 directly and 8 flipped), or rotation 0 for all.
  const pick=(f,r)=>{
   for(const [k,data] of sprites){
    if(k[0]===f&&(k[1]===String(r)||k[1]==='0'))return {data,flip:false};
    if(k.length===4&&k[2]===f&&k[3]===String(r))return {data,flip:true};
   }
   return f==='A'?null:pick('A',r); // missing rotation: fall back to standing
  };
  const w=128,h=128,baseline=112,rgba=new Uint8Array(w*8*h*frames.length*4);
  frames.forEach((f,fy)=>{for(let r=1;r<=8;r++){
   const found=pick(f,r);if(!found)continue;const s=doomPatch(found.data,colours),fx=r-1;
   for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++){
    const dx=fx*w+w/2+(found.flip?s.left-1-x:x-s.left),dy=fy*h+baseline-s.top+y;
    if(dx<fx*w||dx>=(fx+1)*w||dy<fy*h||dy>=(fy+1)*h)continue;
    const at=(dy*w*8+dx)*4,from=(y*s.w+x)*4;rgba.set(s.rgba.subarray(from,from+4),at);
   }
  }});
  const texture=`eq_pony_${id}_${motion}.png`;await fs.writeFile(path.join(mod,'textures',texture),png(w*8,h*frames.length,rgba));
  output[id][motion]={texture,frames:frames.length,columns:8,width:w,height:h,baseline,pixelsPerNode:48};
 }
 console.log(id,'from',source,'prefix',prefix,Object.entries(output[id]).map(([m,s])=>m+':'+s.frames).join(' '));
}
await fs.writeFile(file,JSON.stringify(output));
