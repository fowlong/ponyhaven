import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const DEFAULT_WORLD_HASH='9a160f17c19c45bda7a67c444c1ab0778e72e476efd3bb562842de8f95e6d869';
export const ENGINE_FOLDER='luanti-5.17.0-win64';

/** The client shaders are engine assets. Other client files are user state. */
export function includeRuntimeFile(relative){
 const parts=relative.replaceAll('\\','/').split('/');
 if(['cache','worlds','mod_data'].includes(parts[0]))return false;
 if(parts[0]==='client')return parts.length===1||parts[1]==='shaders';
 return !/\.(log|sqlite|sqlite3)(?:-wal|-shm)?$/.test(parts.at(-1))&&parts.at(-1)!=='latest-log.txt';
}
export async function engineAssetsReady(nativeRoot){
 const engine=path.join(nativeRoot,ENGINE_FOLDER);
 try{
  for(const file of ['bin/luanti.exe','client/shaders/cloud_shader/opengl_vertex.glsl','client/shaders/cloud_shader/opengl_fragment.glsl','client/shaders/nodes_shader/opengl_vertex.glsl','client/shaders/nodes_shader/opengl_fragment.glsl']){
   const stat=await fs.stat(path.join(engine,file));if(!stat.isFile()||!stat.size)return false;
  }
  return true;
 }catch{return false;}
}
export async function readDefaultWorld(nativeRoot,{verify=false}={}){
 const root=path.join(nativeRoot,'world');
 const info=JSON.parse(await fs.readFile(path.join(root,'world.json'),'utf8'));
 const locations=JSON.parse(await fs.readFile(path.join(root,'locations.json'),'utf8'));
 const names=(await fs.readdir(path.join(root,'regions'))).sort();
 if(info.format!==1||info.worldHash!==DEFAULT_WORLD_HASH||info.regions!==494||names.length!==494||names.some(n=>!/^r\.-?\d+\.-?\d+\.eqr$/.test(n))||locations.worldHash!==info.worldHash||locations.chests?.length!==50||locations.npcs?.length!==16)
  throw Error('The bundled Equestria world is incomplete. Extract the complete Ponyhaven folder again.');
 for(const name of ['states.json','LICENSE.txt','README.txt','PONYHAVEN_ADAPTATION.txt'])await fs.access(path.join(root,name));
 if(verify){
  const hash=createHash('sha256');
  for(const name of names){hash.update(name);hash.update(await fs.readFile(path.join(root,'regions',name)));}
  hash.update(await fs.readFile(path.join(root,'states.json')));
  if(hash.digest('hex')!==DEFAULT_WORLD_HASH)throw Error('The bundled Equestria region hash does not match the default map.');
 }
 return {root,info};
}
