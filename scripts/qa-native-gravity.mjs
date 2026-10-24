// Real launcher/config regression, using a temporary diagnostic addon and saves.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {NativeGames} from '../desktop/games.mjs';

const root=path.resolve('tmp/native-gravity-'+Date.now());
await fs.mkdir(root,{recursive:true});
const lua=path.join(root,'gravity.lua'),addon=path.join(root,'gravity-qa.pk3');
await fs.writeFile(lua,`
local function report(label, p)
 print(string.format("PONYHAVEN_GRAVITY %s %d %d %d %d %d %d",
  label, (p.mo.eflags & MFE_VERTICALFLIP) and 1 or 0,
  (p.pflags & PF_FLIPCAM) and 1 or 0, CV_FindVar("flipcam").value,
  p.mo.x, p.mo.y, AngleFixed(p.mo.angle)/FRACUNIT))
end
addHook("PlayerCmd", function(p,cmd)
 if p ~= consoleplayer then return end
 if leveltime >= 140 and leveltime < 152 then cmd.sidemove = -30 end
 if leveltime >= 190 and leveltime < 202 then cmd.sidemove = 30 end
end)
addHook("ThinkFrame", function()
 local p=consoleplayer
 if not (p and p.mo and p.mo.valid) then return end
 if leveltime == 105 then
  report("start",p)
  COM_BufInsertText(p,"screenshot\\n")
 end
 if leveltime == 139 then report("before-left",p) end
 if leveltime == 170 then report("after-left",p) end
 if leveltime == 189 then report("before-right",p) end
 if leveltime == 220 then report("after-right",p) end
 if leveltime == 245 then COM_BufInsertText(p,"quit\\n") end
end)
`);
execFileSync(process.env.PYTHON || 'python',['-c',
  'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],"w"); z.write(sys.argv[2],"Lua/gravity.lua"); z.close()',addon,lua]);
process.env.SDL_VIDEODRIVER='dummy';
process.env.SDL_RENDER_DRIVER='software';
process.env.PONYHAVEN_QA_SILENT='1';
const results=[];
for (const map of [23,1]) {
  const events=[],profile={id:'map-'+map,name:'Gravity Test'};
  const home=path.join(root,'profiles',profile.id,'adventure','srb2');
  await fs.mkdir(home,{recursive:true});
  // Represent an existing profile saved with the old camera preference.
  for (const name of ['config.cfg','ponyhaven.cfg'])
    await fs.writeFile(path.join(home,name),'flipcam "No"\nflipcam2 "No"\n');
  const runner=new NativeGames(path.resolve(process.env.QA_NATIVE_ROOT || 'native'),root,
    event=>events.push(event),{resolve:async()=>addon});
  let timer;
  try {
    await runner.launch({game:'adventure',pony:'twilight',map,mode:'solo',fullscreen:false,pack:'qa-only'},profile);
    const running=runner.running;
    await Promise.race([running.closed,new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(Error('Native gravity QA timed out')),25000);
    })]);
    assert.equal(events.at(-1).type,'ended');
    const files=await fs.readdir(home,{recursive:true});
    const logs=(await Promise.all(files.filter(f=>f.endsWith('.txt')).map(f=>fs.readFile(path.join(home,f),'utf8')))).join('\n');
    assert.doesNotMatch(logs,/Lua error|stack traceback/i);
    const records=[...logs.matchAll(/PONYHAVEN_GRAVITY ([\w-]+) ([01]) ([01]) ([01]) (-?\d+) (-?\d+) (-?\d+)/g)]
      .map(m=>({label:m[1],reverse:+m[2],camera:+m[3],setting:+m[4],x:+m[5],y:+m[6],angle:+m[7]}));
    assert.equal(records.length,5,logs.slice(-2000));
    assert.ok(records.every(r=>r.camera===1 && r.setting===1),'Old camera preference must be replaced');
    assert.ok(records.every(r=>r.reverse===(map===23?1:0)),'Course gravity must remain intact');
    const displacement=(a,b)=>{
      const angle=a.angle*Math.PI/180;
      return Math.sin(angle)*(b.x-a.x)-Math.cos(angle)*(b.y-a.y);
    };
    assert.ok(displacement(records[1],records[2])<0,'Left input should move left');
    assert.ok(displacement(records[3],records[4])>0,'Right input should move right');
    const shots=files.filter(f=>f.endsWith('.png'));
    assert.equal(shots.length,1);
    results.push({map,records,screenshot:path.join(home,shots[0])});
    console.log('Map',map,'old preference corrected; gravity preserved; left/right movement passed;',path.join(home,shots[0]));
  } finally {clearTimeout(timer);await runner.stop();}
}
await fs.writeFile(path.join(root,'report.json'),JSON.stringify(results,null,2));
console.log('Gravity regression passed:',root);
