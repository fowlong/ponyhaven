import fs from 'node:fs/promises';
import {inflateRawSync} from 'node:zlib';
/** Read selected files directly from a world ZIP; archive paths are never extracted. */
export async function openWorldZip(filename){
 const handle=await fs.open(filename,'r');
 try{
  const stat=await handle.stat();if(stat.size<22||stat.size>4*1024**3)throw Error('Choose an Equestria world ZIP under 4 GB.');
  const size=Math.min(stat.size,65557),tail=Buffer.alloc(size);await handle.read(tail,0,size,stat.size-size);
  let end=tail.length-22;for(;end>=0;end--)if(tail.readUInt32LE(end)===0x06054b50)break;
  if(end<0)throw Error('The selected file is not a ZIP archive.');
  const count=tail.readUInt16LE(end+10),length=tail.readUInt32LE(end+12),offset=tail.readUInt32LE(end+16);
  if(count===65535||length===0xffffffff||offset===0xffffffff||length>16*1024**2||offset+length>stat.size||tail.readUInt16LE(end+4)!==0)throw Error('Use the ordinary ZIP download of Equestria 6; split/ZIP64 archives are not supported.');
  const directory=Buffer.alloc(length);await handle.read(directory,0,length,offset);const entries=new Map();let at=0,total=0;
  for(let i=0;i<count;i++){
   if(at+46>directory.length||directory.readUInt32LE(at)!==0x02014b50)throw Error('The world ZIP directory is damaged.');
   const n=directory.readUInt16LE(at+28),extra=directory.readUInt16LE(at+30),comment=directory.readUInt16LE(at+32);
   const name=directory.toString('utf8',at+46,at+46+n).replaceAll('\\','/');
   const entry={name,flags:directory.readUInt16LE(at+8),method:directory.readUInt16LE(at+10),packed:directory.readUInt32LE(at+20),size:directory.readUInt32LE(at+24),offset:directory.readUInt32LE(at+42)};
   if(name.startsWith('/')||name.includes(':')||name.split('/').includes('..')||entries.has(name)||(entry.flags&1)||![0,8].includes(entry.method))throw Error('Use an unencrypted, ordinary world ZIP.');
   if(entry.size>128*1024**2||entry.offset+30+entry.packed>stat.size)throw Error('The world ZIP contains an invalid file.');
   total+=entry.size;if(total>8*1024**3)throw Error('The extracted world exceeds the 8 GB import limit.');
   entries.set(name,entry);at+=46+n+extra+comment;
  }
  const levels=[...entries.keys()].filter(n=>/(^|\/)level\.dat$/.test(n));
  const roots=levels.map(n=>n.slice(0,-'level.dat'.length)).filter(prefix=>[...entries.keys()].some(n=>n.startsWith(prefix+'region/r.')&&n.endsWith('.mca')));
  if(roots.length!==1)throw Error('Select a ZIP containing exactly one Equestria world.');
  const prefix=roots[0];
  return {prefix,entries,close:()=>handle.close(),async read(name){
   const entry=entries.get(name);if(!entry)throw Error('Missing world file: '+name);
   const local=Buffer.alloc(30);await handle.read(local,0,30,entry.offset);if(local.readUInt32LE(0)!==0x04034b50)throw Error('The world ZIP is damaged.');
   const start=entry.offset+30+local.readUInt16LE(26)+local.readUInt16LE(28),packed=Buffer.alloc(entry.packed);
   if(start+packed.length>stat.size)throw Error('The world ZIP is truncated.');
   const read=await handle.read(packed,0,packed.length,start);if(read.bytesRead!==packed.length)throw Error('The world ZIP is incomplete.');
   const data=entry.method===0?packed:inflateRawSync(packed,{maxOutputLength:Math.max(1,entry.size)});
   if(data.length!==entry.size)throw Error('A world ZIP file is damaged.');return data;
  }};
 }catch(error){await handle.close();throw error;}
}
