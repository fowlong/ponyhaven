import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {engineAssetsReady,includeRuntimeFile,readDefaultWorld} from '../desktop/equestria/assets.mjs';
const root=process.cwd();
const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const refresh=process.argv.includes('--refresh');
// Stop before touching an existing release if a runtime was removed, quarantined,
// or never built. An overlay copy must never silently retain an older executable.
for (const game of ['adventure','ponykart']) {
  const executable=path.join(root,'native',game,game+'.exe');
  try {
    const stat=await fs.stat(executable);
    if (!stat.isFile() || stat.size===0) throw new Error('Empty or invalid executable');
    await fs.access(executable);
  } catch {
    throw new Error(`Cannot package: ${game}.exe is missing or inaccessible. Resolve the native build or security detection first. The existing release has not been changed.`);
  }
}
execFileSync(process.execPath,['scripts/write-firebase-setup.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/retire-equestria-backdrop.mjs'],{stdio:'inherit'});
const luanti=path.join(root,'native','equestria','luanti-5.17.0-win64');
if(!await engineAssetsReady(path.dirname(luanti)))throw Error('Equestria engine or required shaders are missing.');
await readDefaultWorld(path.dirname(luanti),{verify:true});
for(const name of ['materials.json','ponies.json','npcs.json','surfaces.json','bevels.json','bevels.lua','models/eq_bevel_1f.obj','encounters.json','map.json','combat.lua','maps.lua','init.lua','models/eq_melee_arc.obj','textures/eq_melee_trail.png','WYRDA_LICENSE.txt'])
  await fs.access(path.join(luanti,'games','ponyhaven','mods','ponyhaven',name));
const runtimeManifest={};
for(const game of ['adventure','ponykart']){
  runtimeManifest[game]={};
  for(const name of (await fs.readdir(path.join(root,'native',game))).sort()){
    const file=path.join(root,'native',game,name),stat=await fs.stat(file);
    if(stat.isFile()&&!name.endsWith('.log')&&name!=='latest-log.txt')runtimeManifest[game][name]={bytes:stat.size,sha256:createHash('sha256').update(await fs.readFile(file)).digest('hex')};
  }
}
await fs.writeFile(path.join(root,'native','manifest.json'),JSON.stringify(runtimeManifest,null,2));
const release=path.join(root,'release',`Ponyhaven-${version}-win32-x64`);
if(!release.startsWith(root+path.sep))throw new Error('Invalid build path.');
// --refresh repairs this exact version's app assets without touching user data.
await fs.mkdir(path.dirname(release),{recursive:true});
if(refresh){
 const previous=JSON.parse(await fs.readFile(path.join(release,'resources','app','package.json'),'utf8'));
 if(previous.name!=='ponyhaven'||previous.version!==version)throw Error('Refresh requires the same Ponyhaven release version.');
 execFileSync(process.execPath,['scripts/clear-equestria-package-cache.mjs',path.join(release,'resources','app')],{stdio:'inherit'});
}else{
 await fs.mkdir(release);
 await fs.cp(path.join(root,'node_modules/electron/dist'),release,{recursive:true});
}
const resource=path.join(release,'resources','app');
await fs.mkdir(resource,{recursive:true});
// Preserve the old compiled app outside the release before replacing it. An
// overlay would otherwise ship stale hashed bundles containing the retired UI.
if(refresh){
 const previousDist=path.resolve(resource,'dist'),backup=path.resolve(root,'tmp','release-dist-before-'+Date.now());
 if(!previousDist.startsWith(release+path.sep)||!backup.startsWith(path.resolve(root,'tmp')+path.sep))throw Error('Invalid build backup path.');
 if(await fs.stat(previousDist).then(()=>true,()=>false))await fs.rename(previousDist,backup);
}
for(const dir of ['desktop','dist','native'])await fs.cp(path.join(root,dir),path.join(resource,dir),{recursive:true,filter:p=>{
  if(path.basename(p)==='latest-log.txt'||p.endsWith('.log'))return false;
  if(p.startsWith(luanti+path.sep)&&!includeRuntimeFile(path.relative(luanti,p)))return false;
  return true;
}});
await fs.writeFile(path.join(resource,'package.json'),JSON.stringify({name:'ponyhaven',productName:'Ponyhaven',version,type:'module',main:'desktop/main.mjs'}));
if(!refresh){
 await fs.copyFile(path.join(release,'electron.exe'),path.join(release,'Ponyhaven.exe'));
 // Remove only the known duplicate executable created by this script.
 await fs.unlink(path.join(release,'electron.exe'));
}
for(const file of ['START_HERE.txt','DESKTOP_SETUP.md','MOBILE_SYNC_SETUP.md','FIREBASE_SETUP.md','FIREBASE_CONSOLE_SETUP.txt','GITHUB_PUBLISHING.txt','THIRD_PARTY.md','QA.md','EQUESTRIA_0.3.0.md','NATIVE_SECURITY_REVIEW_2026-10-20.md'])await fs.copyFile(path.join(root,file),path.join(release,file));
const manifest={};
for(const game of ['adventure','ponykart']) {
  const p=path.join(resource,'native',game,game+'.exe');
  manifest[game]=createHash('sha256').update(await fs.readFile(p)).digest('hex');
}
manifest.equestria=createHash('sha256').update(await fs.readFile(path.join(luanti,'bin','luanti.exe'))).digest('hex');
await fs.writeFile(path.join(release,'build.json'),JSON.stringify({version,revision:'equestria-adaptive-scenery-saves-combat',builtAt:new Date().toISOString(),engines:manifest},null,2));
execFileSync(process.execPath,['scripts/verify-equestria-release.mjs',path.join(release,'resources','app')],{stdio:'inherit'});
execFileSync('powershell.exe',['-NoProfile','-File','scripts/package-engine-sources.ps1',release],{stdio:'inherit',windowsHide:true});
console.log('Portable desktop build:',release);
if(!process.argv.includes('--no-zip'))execFileSync('powershell.exe',['-NoProfile','-File','scripts/package-windows-zip.ps1',release],{stdio:'inherit',windowsHide:true});
