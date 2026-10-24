// Exercise real progress traffic; compare runtime and unrelated fixture contents.
// This is a scoped regression check, not a substitute for a malware scanner.
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {NativeGames} from '../desktop/games.mjs';
const root=path.resolve('tmp/native-safety-'+Date.now());
const native=path.resolve(process.env.QA_NATIVE_ROOT || 'native');
await fs.mkdir(root,{recursive:true});
process.env.SDL_VIDEODRIVER='dummy';process.env.SDL_RENDER_DRIVER='software';
process.env.PONYHAVEN_QA_SILENT='1';
async function files(folder) {
  const result=[];
  for(const entry of await fs.readdir(folder,{withFileTypes:true})) {
    const full=path.join(folder,entry.name);
    if(entry.isDirectory())result.push(...await files(full));else if(entry.isFile())result.push(full);
  }
  return result;
}
async function hashes(folder) {
  const result={};
  for(const full of await files(folder)) {
    const hash=createHash('sha256');
    for await(const chunk of createReadStream(full))hash.update(chunk);
    result[path.relative(folder,full)]=hash.digest('hex');
  }
  return result;
}
const fixtures=path.join(root,'unrelated-files');
await fs.mkdir(path.join(fixtures,'nested'),{recursive:true});
for(const name of ['document.txt','settings.json','nested/notes.md','nested/example.csv'])
  await fs.writeFile(path.join(fixtures,name),'Ponyhaven QA fixture: do not modify\n'+name);
const beforeRuntime=await hashes(native),beforeFixtures=await hashes(fixtures),report={};
for(const game of ['adventure','ponykart']) {
  const events=[],runner=new NativeGames(native,root,event=>events.push(event));
  try {
    await runner.launch({game,pony:'twilight',map:1,mode:'solo',fullscreen:false},{id:game,name:'Safety Test'});
    const end=Date.now()+45000;
    while(Date.now()<end) {
      assert.ok(runner.running,game+' exited before the test completed');
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    const snapshot=runner.running.snapshot;
    assert.ok(snapshot.elapsed>70,game+' simulation did not advance');
    await runner.stop();
    const updates=events.filter(e=>e.type==='progress');
    assert.ok(updates.length>100,'Expected sustained progress pipe traffic');
    assert.deepEqual(events.slice(0,2).map(e=>e.type),['loading','started']);
    assert.equal(events.at(-1).type,'ended');
    assert.ok(!(await files(path.join(root,'profiles'))).some(f=>/progress-.*\.json|\.next$/.test(f)));
    report[game]={updates:updates.length,last:snapshot,ended:true};
    console.log(game,updates.length,'pipe updates; clean stop; no progress files');
  } finally {await runner.stop();}
}
assert.deepEqual(await hashes(native),beforeRuntime,'Native runtime files changed during gameplay');
assert.deepEqual(await hashes(fixtures),beforeFixtures,'Unrelated QA fixtures changed');
report.scope={runtimeFiles:Object.keys(beforeRuntime).length,unchangedFixtures:Object.keys(beforeFixtures).length};
await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));
console.log('Runtime and unrelated fixture hashes unchanged:',root);
