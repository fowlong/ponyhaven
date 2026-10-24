// Check effective bindings saved by the real engine, not just launcher text.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {NativeGames, controls} from '../desktop/games.mjs';

const root=path.resolve('tmp/native-controls-'+Date.now());
await fs.mkdir(root,{recursive:true});
const lua=path.join(root,'controls.lua'),addon=path.join(root,'controls-qa.pk3');
await fs.writeFile(lua,`
addHook("ThinkFrame", function()
 if not (consoleplayer and consoleplayer.mo and consoleplayer.mo.valid) then return end
 if leveltime == 35 then
  print("PONYHAVEN_CONTROLS saving effective engine bindings")
  COM_BufInsertText(consoleplayer,"saveconfig kartconfig.cfg\\n")
 end
 if leveltime == 70 then COM_BufInsertText(consoleplayer,"quit\\n") end
end)
`);
execFileSync(process.env.PYTHON || 'python',['-c',
  'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],"w"); z.write(sys.argv[2],"Lua/controls.lua"); z.close()',addon,lua]);
process.env.SDL_VIDEODRIVER='dummy';
process.env.SDL_RENDER_DRIVER='software';
process.env.PONYHAVEN_QA_SILENT='1';
// The keys advertised in src/arcade.ts and DESKTOP_SETUP.md.
const expected={accelerate:['w','up arrow'],brake:['s','down arrow'],
  turnleft:['a','left arrow'],turnright:['d','right arrow'],
  drift:['space','joy11'],fire:['x','joy10']};
const oldBindings='setcontrol "accelerate" "a" "JOY1"\nsetcontrol "brake" "d" "JOY2"\n'+
  'setcontrol "turnleft" "LEFT ARROW"\nsetcontrol "turnright" "RIGHT ARROW"\n'+
  'setcontrol "drift" "s" "JOY11"\nsetcontrol "fire" "SPACE" "JOY10"\n';
const results=[];
for(const label of ['fresh','existing','relaunch']) {
  const profile={id:label==='fresh'?'fresh':'existing',name:'Control Test'};
  const home=path.join(root,'profiles',profile.id,'ponykart','srb2kart');
  if(label==='existing') {
    await fs.mkdir(home,{recursive:true});
    await fs.writeFile(path.join(home,'kartconfig.cfg'),oldBindings);
    // Reproduce an old installation: correct mappings in the ignored filename.
    await fs.writeFile(path.join(home,'autoexec.cfg'),controls('ponykart'));
    await fs.writeFile(path.join(home,'kartexec.cfg'),oldBindings);
  }
  const events=[],runner=new NativeGames(path.resolve(process.env.QA_NATIVE_ROOT || 'native'),root,
    event=>events.push(event),{resolve:async()=>addon});
  let timer;
  try {
    await runner.launch({game:'ponykart',pony:'twilight',map:1,mode:'solo',fullscreen:false,pack:'qa-only'},profile);
    const running=runner.running;
    await Promise.race([running.closed,new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(Error('Native controls QA timed out')),20000);
    })]);
    assert.equal(events.at(-1).type,'ended',label+' clean exit');
    const log=await fs.readFile(path.join(home,'log.txt'),'utf8');
    assert.doesNotMatch(log,/Lua error|stack traceback|Control '[^']+' unknown/i);
    assert.match(log,/PONYHAVEN_CONTROLS saving effective engine bindings/);
    const saved=await fs.readFile(path.join(home,'kartconfig.cfg'),'utf8');
    const actual=Object.fromEntries([...saved.matchAll(/^setcontrol "([^"]+)" "([^"]+)"(?: "([^"]+)")?/gm)]
      .map(m=>[m[1],[m[2],m[3]].filter(Boolean).map(k=>k.toLowerCase())]));
    for(const [action,keys] of Object.entries(expected))
      assert.deepEqual(actual[action],keys,label+': '+action+' must match the UI');
    assert.equal(await fs.readFile(path.join(home,'kartexec.cfg'),'utf8'),controls('ponykart'));
    assert.ok(events.some(e=>e.type==='progress' && e.map===1),'Course reached the launcher');
    results.push({profile:label,bindings:Object.fromEntries(Object.keys(expected).map(k=>[k,actual[k]]))});
    console.log(label+': all six actions and both keyboard alternatives match the UI; clean exit');
  } finally {clearTimeout(timer);await runner.stop();}
}
await fs.writeFile(path.join(root,'report.json'),JSON.stringify(results,null,2));
console.log('Native controls regression passed:',root);
