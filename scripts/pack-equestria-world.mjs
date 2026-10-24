// Streamable, lossless voxel store. The original downloaded world is read-only.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {regionChunks,chunkSections} from '../desktop/equestria/anvil.mjs';
import {packRegion} from '../desktop/equestria/region-store.mjs';
const [sourceArg,reportArg,outputArg]=process.argv.slice(2);
if(!sourceArg || !reportArg || !outputArg)throw Error('Usage: pack-equestria-world <world> <inspection-report.json> <new-output-folder>');
const source=await fs.realpath(sourceArg),output=path.resolve(outputArg),report=JSON.parse(await fs.readFile(reportArg,'utf8'));
if(output.toLowerCase().startsWith(source.toLowerCase()+path.sep)||output.toLowerCase()===source.toLowerCase())throw Error('Output must be outside the original world.');
await fs.mkdir(output);await fs.mkdir(path.join(output,'regions'));
const states=['minecraft:air',...Object.keys(report.blockStates).filter(s=>s!=='minecraft:air').sort()];
if(states.length>65535)throw Error('Too many source block states.');
const stateIds=new Map(states.map((s,i)=>[s,i])), digest=createHash('sha256'),sourceDigest=createHash('sha256');
const files=(await fs.readdir(path.join(source,'region'))).filter(n=>/^r\.-?\d+\.-?\d+\.mca$/.test(n)).sort();
let bytes=0,count=0;
for(const file of files) {
 const input=await fs.readFile(path.join(source,'region',file));sourceDigest.update(file);sourceDigest.update(input);
 const chunks=Array.from(regionChunks(input),({slot,chunk})=>({slot,chunk:chunkSections(chunk)}));
 const packed=packRegion(chunks,stateIds,Math.floor(report.min.y/16),Math.floor(report.max.y/16));
 const name=file.replace(/\.mca$/,'.eqr');await fs.writeFile(path.join(output,'regions',name),packed);
 digest.update(name);digest.update(packed);bytes+=packed.length;count++;
 if(count%20===0 || count===files.length)console.log(`${count}/${files.length} regions packed (${Math.round(bytes/1048576)} MiB)`);
}
if(sourceDigest.digest('hex')!==report.sourceHash)throw Error('The source world changed after inspection. Output is incomplete.');
await fs.writeFile(path.join(output,'states.json'),JSON.stringify(states));
digest.update(JSON.stringify(states));
await fs.writeFile(path.join(output,'world.json'),JSON.stringify({format:1,sourceHash:report.sourceHash,worldHash:digest.digest('hex'),bytes,regions:files.length,states:states.length,min:report.min,max:report.max,source:report.source,commands:report.commands,sourceSpawn:report.spawn},null,2));
for(const name of ['README.txt','LICENSE.txt'])await fs.copyFile(path.join(source,name),path.join(output,name));
console.log(`Packed complete world in ${output}; ${states.length} exact states, ${Math.round(bytes/1048576)} MiB.`);
