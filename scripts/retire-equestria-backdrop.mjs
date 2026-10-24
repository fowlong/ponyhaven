// Remove only the obsolete, generated whole-map/coarse meshes in this workspace.
import fs from 'node:fs/promises';
import path from 'node:path';
const workspace=path.resolve('.'),{version}=JSON.parse(await fs.readFile('package.json','utf8'));
for(const base of ['native/equestria',`release/Ponyhaven-${version}-win32-x64/resources/app/native/equestria`]){
 const models=path.resolve(base,'luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven/models');
 if(!models.startsWith(workspace+path.sep))throw Error('Invalid generated asset directory');
 let count=0;
 for(const name of await fs.readdir(models).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){
  if(name!=='eq_horizon.obj'&&!/^eq_distance_-?\d+_-?\d+\.obj$/.test(name))continue;
  await fs.unlink(path.join(models,name));count++;
 }
 if(count)console.log('Retired',count,'coarse backdrop meshes from',base);
}
