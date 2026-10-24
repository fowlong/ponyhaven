// Build-time preparation only. Players receive these converted files in the app.
import fs from 'node:fs/promises';
import path from 'node:path';
import {readDefaultWorld} from '../desktop/equestria/assets.mjs';
const source=path.resolve(process.argv[2]||'tmp/equestria/imported');
const native=path.resolve('native/equestria'),target=path.join(native,'world');
await fs.mkdir(target,{recursive:true});
async function copy(relative=''){
 for(const entry of await fs.readdir(path.join(source,relative),{withFileTypes:true})){
  const name=path.join(relative,entry.name),from=path.join(source,name),to=path.join(target,name);
  if(entry.isSymbolicLink())throw Error('Unexpected source map link: '+name);
  if(entry.isDirectory()){await fs.mkdir(to,{recursive:true});await copy(name);}
  else try{await fs.link(from,to);}catch(error){if(error.code==='EEXIST')continue;if(!['EXDEV','EPERM','EACCES'].includes(error.code))throw error;await fs.copyFile(from,to);}
 }
}
await copy();
await fs.writeFile(path.join(target,'PONYHAVEN_ADAPTATION.txt'),`Ponyhaven Equestria — an Equestria 6 Update 8 adaptation

World by EagleCraft.fr / Baroriam, incorporating Brohoof.com builds and
CaptainZepto's landscape. Original README.txt and LICENSE.txt accompany this map.
https://www.planetminecraft.com/project/equestria-6/
https://kilorat.com/brohoof.com/
https://www.planetminecraft.com/project/equestria-geographical-minecraft-map/

This map adaptation is licensed under Creative Commons
Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0).
https://creativecommons.org/licenses/by-nc-sa/4.0/

Changes by Ponyhaven: conversion of all 494 Anvil regions to streamed EQR data;
Luanti materials and original textures; reversed Z coordinates; natural-terrain
smoothing meshes and approximate collision; town/NPC/quest/treasure placements;
and replacements for nine internal teleport routes. No Minecraft engine assets
or NoCubes code are included. Smoothing is enabled automatically when terrain
is generated. The converted map is the included default Equestria world.

Conversion and gameplay source are included in engine-sources.zip and in
resources/app/desktop/equestria and resources/app/native/equestria/
luanti-5.17.0-win64/games/ponyhaven. Preserve these credits and the map license
with any shared adaptation. No endorsement by the original creators is implied.
`);
const world=await readDefaultWorld(native,{verify:true});
console.log('Bundled default Equestria world verified:',world.info.regions,'regions, 50 chests,',world.info.worldHash);
