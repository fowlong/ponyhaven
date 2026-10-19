import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root=process.cwd();
execFileSync(process.execPath,['scripts/write-firebase-setup.mjs'],{stdio:'inherit'});
execFileSync('python',['scripts/native-manifest.py'],{stdio:'inherit'});
const release=path.join(root,'release','Ponyhaven-win32-x64');
if(!release.startsWith(root+path.sep))throw new Error('Invalid build path.');
await fs.mkdir(release,{recursive:true});
await fs.cp(path.join(root,'node_modules/electron/dist'),release,{recursive:true});
const resource=path.join(release,'resources','app');
await fs.mkdir(resource,{recursive:true});
for(const dir of ['desktop','dist','native'])await fs.cp(path.join(root,dir),path.join(resource,dir),{recursive:true,filter:p=>path.basename(p)!=='latest-log.txt'&&!p.endsWith('.log')});
await fs.writeFile(path.join(resource,'package.json'),JSON.stringify({name:'ponyhaven',productName:'Ponyhaven',version:'0.2.0',type:'module',main:'desktop/main.mjs'}));
await fs.copyFile(path.join(release,'electron.exe'),path.join(release,'Ponyhaven.exe'));
// Remove only the known duplicate executable created by this script.
await fs.unlink(path.join(release,'electron.exe'));
for(const file of ['DESKTOP_SETUP.md','MOBILE_SYNC_SETUP.md','FIREBASE_SETUP.md','FIREBASE_CONSOLE_SETUP.txt','GITHUB_PUBLISHING.txt','THIRD_PARTY.md','QA.md'])await fs.copyFile(path.join(root,file),path.join(release,file));
const manifest={};
for(const game of ['adventure','ponykart']) {
  const p=path.join(resource,'native',game,game+'.exe');
  manifest[game]=createHash('sha256').update(await fs.readFile(p)).digest('hex');
}
await fs.writeFile(path.join(release,'build.json'),JSON.stringify({builtAt:new Date().toISOString(),engines:manifest},null,2));
execFileSync('python',['scripts/package-engine-sources.py'],{stdio:'inherit'});
console.log('Portable desktop build:',release);
