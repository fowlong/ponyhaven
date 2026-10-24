import fs from 'node:fs/promises';
import path from 'node:path';
/** Regenerate old cubic terrain, preserving the old cache and all progress. */
export async function ensureTerrainCache(world){
 const root=path.resolve(world),stamp=path.join(root,'terrain-version.json');
 try{if(JSON.parse(await fs.readFile(stamp,'utf8')).version===3)return;}catch(e){if(e.code!=='ENOENT' && !(e instanceof SyntaxError))throw e;}
 const backup=path.join(root,'terrain-before-smoothing-'+Date.now());
 if(!backup.startsWith(root+path.sep))throw Error('Invalid terrain backup path.');
 for(const name of ['map.sqlite','map.sqlite-wal','map.sqlite-shm']){
  const source=path.join(root,name);try{await fs.stat(source);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  await fs.mkdir(backup,{recursive:true});await fs.rename(source,path.join(backup,name));
 }
 await fs.mkdir(root,{recursive:true});await fs.writeFile(stamp,JSON.stringify({version:3}));
}
/** Only generated terrain is temporary. Quest/player/profile stores are retained. */
export async function resetTerrainCache(world){
 const root=path.resolve(world);
 for(const name of ['map.sqlite','map.sqlite-wal','map.sqlite-shm']){
  const target=path.resolve(root,name);if(!target.startsWith(root+path.sep))throw Error('Invalid terrain cache path.');
  await fs.unlink(target).catch(e=>{if(e.code!=='ENOENT')throw e;});
 }
}
