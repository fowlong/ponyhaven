import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Worker} from 'node:worker_threads';
export async function importEquestria(zipPath,libraryRoot,gamePath,onProgress=()=>{}){
 const root=path.resolve(libraryRoot);await fs.mkdir(root,{recursive:true});
 const output=path.join(root,'import-'+randomUUID()),target=path.join(root,'world');
 // All installation renames stay inside this explicitly named library directory.
 for(const p of [output,target])if(path.dirname(p)!==root)throw Error('Invalid world library path.');
 const result=await new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./import-worker.mjs',import.meta.url),{workerData:{zipPath,output,gamePath}});let completed=null;
  worker.on('message',m=>{if(m.kind==='progress')onProgress(m);else if(m.kind==='complete')completed=m;else if(m.kind==='error')reject(Error(m.message));});
  worker.on('error',reject);worker.on('exit',code=>code===0&&completed?resolve(completed):reject(Error('The Equestria import did not finish. Your previous world has been preserved.')));
 });
 if(await fs.stat(target).then(()=>true,()=>false)){const backup=path.join(root,'previous-'+Date.now());if(path.dirname(backup)!==root)throw Error('Invalid world backup path.');await fs.rename(target,backup);}
 await fs.rename(output,target);return result;
}
