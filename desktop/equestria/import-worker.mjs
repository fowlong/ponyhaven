import fs from 'node:fs/promises';
import path from 'node:path';
import {parentPort,workerData} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {openWorldZip} from './zip-world.mjs';
import {readNBT} from './nbt.mjs';
import {regionChunks,chunkSections} from './anvil.mjs';
import {packRegion} from './region-store.mjs';
import {buildEquestriaLocations} from './locations.mjs';
const {zipPath,output,gamePath}=workerData;
let zip;
try{
 zip=await openWorldZip(zipPath);const level=readNBT(await zip.read(zip.prefix+'level.dat')).Data;
 if(!level||typeof level.LevelName!=='string'||!level.LevelName.toLowerCase().includes('equestria'))throw Error('Choose the Equestria 6 world ZIP from the linked project page.');
 const materials=JSON.parse(await fs.readFile(path.join(gamePath,'mods','ponyhaven','materials.json'),'utf8')),states=materials.map(m=>m.source),ids=new Map(states.map((s,i)=>[s,i]));
 const regionNames=[...zip.entries.keys()].filter(n=>n.startsWith(zip.prefix+'region/')&&/^r\.-?\d+\.-?\d+\.mca$/.test(n.slice((zip.prefix+'region/').length))).sort();
 if(!regionNames.length||regionNames.length>3000)throw Error('The world has no supported Overworld regions.');
 await fs.mkdir(output);await fs.mkdir(path.join(output,'regions'));
 const sourceDigest=createHash('sha256'),digest=createHash('sha256'),commands=[];
 let bytes=0;const min={x:Infinity,y:-64,z:Infinity},max={x:-Infinity,y:319,z:-Infinity};
 for(let i=0;i<regionNames.length;i++){
  const name=path.posix.basename(regionNames[i]),data=await zip.read(regionNames[i]);sourceDigest.update(name);sourceDigest.update(data);
  const chunks=Array.from(regionChunks(data),({slot,chunk})=>({slot,chunk:chunkSections(chunk)}));
  const [,rx,rz]=/^r\.(-?\d+)\.(-?\d+)\.mca$/.exec(name);
  for(const {slot,chunk:c} of chunks){
   if(c.x!==Number(rx)*32+slot%32||c.z!==Number(rz)*32+Math.floor(slot/32))throw Error('Region coordinates do not match '+name+'.');
   min.x=Math.min(min.x,c.x*16);max.x=Math.max(max.x,c.x*16+15);min.z=Math.min(min.z,-c.z*16-15);max.z=Math.max(max.z,-c.z*16);
   for(const e of c.blockEntities)if(e.id==='minecraft:command_block')commands.push({x:e.x,y:e.y,z:-e.z,command:e.Command});}
  const packed=packRegion(chunks,ids),filename=name.replace(/\.mca$/,'.eqr');await fs.writeFile(path.join(output,'regions',filename),packed);bytes+=packed.length;digest.update(filename);digest.update(packed);
  if(i%10===0||i===regionNames.length-1)parentPort.postMessage({kind:'progress',progress:Math.round((i+1)/regionNames.length*95),message:'Converting Equestria: '+(i+1)+' / '+regionNames.length+' regions'});
 }
 await fs.writeFile(path.join(output,'states.json'),JSON.stringify(states));digest.update(JSON.stringify(states));
 const info={format:1,sourceHash:sourceDigest.digest('hex'),worldHash:digest.digest('hex'),bytes,regions:regionNames.length,states:states.length,min,max,source:'https://www.planetminecraft.com/project/equestria-6/',commands,sourceSpawn:{x:level.SpawnX,y:level.SpawnY,z:-level.SpawnZ}};
 await fs.writeFile(path.join(output,'world.json'),JSON.stringify(info,null,2));
 const catalog=JSON.parse(await fs.readFile(path.join(gamePath,'mods','ponyhaven','npcs.json'),'utf8'));
 await fs.writeFile(path.join(output,'locations.json'),JSON.stringify(buildEquestriaLocations(output,catalog),null,2));
 for(const name of ['README.txt','LICENSE.txt'])if(zip.entries.has(zip.prefix+name))await fs.writeFile(path.join(output,name),await zip.read(zip.prefix+name));
 parentPort.postMessage({kind:'complete',worldHash:info.worldHash});
}catch(error){parentPort.postMessage({kind:'error',message:error.message});process.exitCode=1;}finally{await zip?.close();}
