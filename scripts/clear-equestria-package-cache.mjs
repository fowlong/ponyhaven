// Preserve runtime caches outside the distributable folder when repairing a build.
import fs from 'node:fs/promises';
import path from 'node:path';
import {ENGINE_FOLDER} from '../desktop/equestria/assets.mjs';
const workspace=path.resolve('.'),releaseRoot=path.join(workspace,'release');
const app=path.resolve(process.argv[2]||'release/Ponyhaven-0.3.0-win32-x64/resources/app');
if(!app.startsWith(releaseRoot+path.sep))throw Error('Package cache maintenance must stay inside release.');
const engine=path.join(app,'native/equestria',ENGINE_FOLDER);
const backup=path.join(workspace,'tmp','equestria-package-cache-'+Date.now());
const names=['cache','worlds','mod_data'];
for(const e of await fs.readdir(path.join(engine,'client')).catch(error=>{if(error.code==='ENOENT')return [];throw error;}))if(e!=='shaders')names.push(path.join('client',e));
let count=0;
for(const name of names){
 const from=path.resolve(engine,name),to=path.resolve(backup,name);
 if(!from.startsWith(engine+path.sep)||!to.startsWith(backup+path.sep))throw Error('Invalid cache backup path.');
 if(!await fs.stat(from).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;}))continue;
 await fs.mkdir(path.dirname(to),{recursive:true});await fs.rename(from,to);count++;
}
if(count)console.log('Preserved',count,'runtime cache directories/files outside the package:',backup);
