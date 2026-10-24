import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { atomicJSON } from './profiles.mjs';

const LIMIT=128*1024*1024;
const games=['adventure','ponykart'];
export function mapNumber(name) {
  const value=name.toUpperCase().match(/^MAP(\d{2}|[A-Z][0-9A-Z])$/)?.[1];
  if(!value)return 0;
  return /^\d/.test(value)?Number(value):100+(value.charCodeAt(0)-65)*36+parseInt(value[1],36);
}
function wad(data) {
  if(data.length<12 || !['IWAD','PWAD'].includes(data.toString('ascii',0,4)))throw new Error('This is not a valid WAD.');
  const count=data.readUInt32LE(4),offset=data.readUInt32LE(8);
  if(count>30000 || offset<12 || offset+count*16>data.length)throw new Error('The WAD directory is damaged.');
  return Array.from({length:count},(_,i)=>{
    const entry=offset+i*16,start=data.readUInt32LE(entry),size=data.readUInt32LE(entry+4);
    if(start+size>data.length)throw new Error('The WAD contains an invalid lump.');
    return {name:data.toString('ascii',entry+8,entry+16).replace(/\0.*$/,''),data:data.subarray(start,start+size)};
  });
}
function zip(data) {
  let end=data.length-22;
  for(;end>=Math.max(0,data.length-65557);end--)if(data.readUInt32LE(end)===0x06054b50)break;
  if(end<0 || data.readUInt32LE(end)!==0x06054b50)throw new Error('This PK3 has no ZIP directory.');
  const count=data.readUInt16LE(end+10);
  let offset=data.readUInt32LE(end+16),total=0;
  if(count>30000)throw new Error('This level pack contains too many files.');
  return Array.from({length:count},()=>{
    if(offset+46>data.length || data.readUInt32LE(offset)!==0x02014b50)throw new Error('The PK3 directory is damaged.');
    const flags=data.readUInt16LE(offset+8),method=data.readUInt16LE(offset+10),packed=data.readUInt32LE(offset+20),size=data.readUInt32LE(offset+24);
    const n=data.readUInt16LE(offset+28),extra=data.readUInt16LE(offset+30),comment=data.readUInt16LE(offset+32),local=data.readUInt32LE(offset+42);
    const name=data.toString('utf8',offset+46,offset+46+n).replaceAll('\\','/');
    offset+=46+n+extra+comment;total+=size;
    if(total>LIMIT*3 || (flags&1) || ![0,8].includes(method) || name.includes('..') || name.startsWith('/') || name.includes(':') || local+30>data.length || data.readUInt32LE(local)!==0x04034b50)
      throw new Error('This PK3 format is not supported. Use an ordinary, unencrypted level pack.');
    const start=local+30+data.readUInt16LE(local+26)+data.readUInt16LE(local+28);
    if(start+packed>data.length)throw new Error('The PK3 is incomplete.');
    const bytes=method===0?data.subarray(start,start+packed):inflateRawSync(data.subarray(start,start+packed),{maxOutputLength:LIMIT});
    if(bytes.length!==size)throw new Error('The PK3 contains a damaged file.');
    return {name,data:bytes};
  });
}
export { zip as readZipEntries };
function inspectSOC(data,names) {
  const text=data.toString('utf8');
  let inLevel=false;
  for(const raw of text.split(/\r?\n/)) {
    const line=raw.replace(/#.*$/,'').trim();
    if(!line){inLevel=false;continue;}
    const level=line.match(/^LEVEL\s+(\d+|[A-Z][0-9A-Z])$/i);
    if(level){inLevel=true;continue;}
    if(!inLevel || !/^[A-Z0-9_]+\s*=/.test(line.toUpperCase()))throw new Error('Only map settings are supported. This pack also changes game scripts or characters.');
    if(/^(?:SCRIPT|RUNSOC|CUTSCENE|PRECUTSCENE|FORCECHARACTER)/i.test(line))throw new Error('This map uses a script or forced character. Choose a standalone level pack.');
  }
  const headers=[...text.matchAll(/^LEVEL\s+(\d+|[A-Z][0-9A-Z])\s*\r?\n([\s\S]*?)(?=\r?\n\s*\r?\n|$)/gim)];
  for(const h of headers) {
    const number=/^\d+$/.test(h[1])?Number(h[1]):mapNumber('MAP'+h[1]);
    const title=h[2].match(/^LEVELNAME\s*=\s*(.+)$/im)?.[1]?.trim().slice(0,80);
    if(title)names.set(number,title);
  }
}
export function inspectLevel(data,extension) {
  if(data.length>LIMIT)throw new Error('Level packs can be up to 128 MB.');
  const entries=extension==='.wad'?wad(data):extension==='.pk3'?zip(data):null;
  if(!entries)throw new Error('Choose a .wad or .pk3 level pack.');
  const maps=new Set(),names=new Map();
  function check(entry,nested=false) {
    const name=entry.name.toUpperCase(),base=name.split('/').pop();
    if(name.endsWith('/'))return;
    if(name.startsWith('LUA/') || /\.(?:LUA|DLL|EXE|BAT|CMD|PS1|COM|JS)$/i.test(name) || /^(?:LUA_|S_SKIN|P_SKIN|S_START|SS_START)/.test(base) || name.startsWith('SKINS/') || name.startsWith('SPRITES/') || /^(?:PLAYPAL|COLORMAP|PAL\d{4}|CLM\d{4})$/.test(base))
      throw new Error('Choose a level-only pack. Scripts, replacement characters, and palette overrides are not imported.');
    if(name.endsWith('.WAD') && !nested) {
      for(const lump of wad(entry.data))check(lump,true);
      const id=mapNumber(base.slice(0,-4));if(id)maps.add(id);
      return;
    }
    if(['MAINCFG','OBJCTCFG'].includes(base) || base.startsWith('SOC_') || name.startsWith('SOC/') || name.endsWith('.SOC')) {inspectSOC(entry.data,names);return;}
    const id=mapNumber(base);if(id)maps.add(id);
  }
  entries.forEach((entry)=>check(entry));
  if(!maps.size)throw new Error('No MAP01–MAPZZ levels were found in this pack.');
  return [...maps].sort((a,b)=>a-b).map((id)=>({id,name:names.get(id)||`Custom level ${id}`}));
}
export class LevelLibrary {
  constructor(root){this.root=root;}
  folder(profile,game){if(!games.includes(game))throw new Error('Choose a game first.');return path.join(this.root,'profiles',profile.id,'levels',game);}
  async list(profile,game){
    try{return JSON.parse(await fs.readFile(path.join(this.folder(profile,game),'index.json'),'utf8'));}
    catch(e){if(e.code==='ENOENT')return [];throw new Error('Your level library needs recovery; its files have been preserved.');}
  }
  async add(profile,game,filename){
    const info=await fs.stat(filename);
    if(info.size>LIMIT)throw new Error('Level packs can be up to 128 MB.');
    const data=await fs.readFile(filename),extension=path.extname(filename).toLowerCase(),maps=inspectLevel(data,extension);
    const hash=createHash('sha256').update(data).digest('hex'),folder=this.folder(profile,game);
    const pack={id:hash,name:path.basename(filename,extension).slice(0,80),extension,maps,bytes:data.length};
    const list=await this.list(profile,game);
    if(list.some((p)=>p.id===hash))return list;
    if(list.length>=50)throw new Error('This profile already has 50 imported packs. Remove one before importing another.');
    await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,hash+extension),data);
    await atomicJSON(path.join(folder,'index.json'),[...list,pack]);return [...list,pack];
  }
  async resolve(profile,game,id,map){
    if(!/^[a-f0-9]{64}$/.test(id||''))throw new Error('Choose an imported level first.');
    const pack=(await this.list(profile,game)).find((p)=>p.id===id && p.maps.some((m)=>m.id===map));
    if(!pack || !['.wad','.pk3'].includes(pack.extension))throw new Error('Import the same level pack as your host before joining.');
    const file=path.join(this.folder(profile,game),id+pack.extension);
    const bytes=await fs.readFile(file);
    if(createHash('sha256').update(bytes).digest('hex')!==id)throw new Error('This level file changed. Import the original pack again.');
    return file;
  }
  async remove(profile,game,id){
    const list=await this.list(profile,game),pack=list.find((p)=>p.id===id);
    if(!pack || !/^[a-f0-9]{64}$/.test(id) || !['.wad','.pk3'].includes(pack.extension))throw new Error('Level pack not found.');
    await atomicJSON(path.join(this.folder(profile,game),'index.json'),list.filter((p)=>p.id!==id));
    await fs.unlink(path.join(this.folder(profile,game),id+pack.extension));return list.filter((p)=>p.id!==id);
  }
}
