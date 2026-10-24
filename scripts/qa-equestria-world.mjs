import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {availablePort} from '../desktop/games.mjs';
const root=path.resolve('tmp/equestria-world-qa-'+Date.now()),imported=path.resolve('tmp/equestria/imported');
await fs.mkdir(path.join(root,'imported','regions'),{recursive:true});await fs.mkdir(path.join(root,'worldmods','equestria_qa'),{recursive:true});
for(const file of await fs.readdir(imported))if(file!=='regions')await fs.link(path.join(imported,file),path.join(root,'imported',file));
for(const file of await fs.readdir(path.join(imported,'regions')))await fs.link(path.join(imported,'regions',file),path.join(root,'imported','regions',file));
await fs.writeFile(path.join(root,'world.mt'),'gameid = ponyhaven\nbackend = sqlite3\nplayer_backend = sqlite3\nauth_backend = sqlite3\nmod_storage_backend = sqlite3\nload_mod_equestria_qa = true\n');
await fs.writeFile(path.join(root,'qa.conf'),`bind_address = 127.0.0.1\nserver_announce = false\nmg_name = singlenode\nchunksize = 2\nnum_emerge_threads = 1\nponyhaven_session = 00000000-0000-4000-8000-000000000001\nmax_block_generate_distance = 4\n`);
await fs.writeFile(path.join(root,'worldmods','equestria_qa','mod.conf'),'name = equestria_qa\ndepends = ponyhaven\n');
await fs.writeFile(path.join(root,'worldmods','equestria_qa','init.lua'),`
local towns={{name='Ponyville',x=0,y=8,z=16},{name='Canterlot',x=616,y=64,z=844},{name='Cloudsdale',x=-332,y=253,z=1703},{name='Crystal Empire',x=-998,y=7,z=4279}}
local nextTown=1
local function inspect()
 local p=towns[nextTown];if not p then ponyhaven.emit({kind='qa-complete',towns=4});core.request_shutdown('QA complete',false,0);return end
 core.emerge_area(vector.offset(p,-18,-20,-18),vector.offset(p,18,20,18),function(_,action,remaining)
  assert(action~=core.EMERGE_ERRORED and action~=core.EMERGE_CANCELLED,'Map emergence failed')
  if remaining==0 then
   local found=0;local smooth=0
   for x=p.x-16,p.x+16 do for z=p.z-16,p.z+16 do for y=p.y-18,p.y+18 do
    local name=core.get_node({x=x,y=y,z=z}).name
    assert(name~='ignore','Unloaded town voxel')
    if name~='air' then found=found+1 end;if name:match('^ponyhaven:surface_') then smooth=smooth+1 end
   end end end
   assert(found>50,'Town has no imported structures')
   ponyhaven.emit({kind='qa-town',town=p.name,nodes=found,smoothed=smooth})
   nextTown=nextTown+1;core.after(.1,inspect)
  end
 end)
end
core.after(.1,inspect)
`);
const exe=path.resolve('native/equestria/luanti-5.17.0-win64/bin/luanti.exe'),port=await availablePort();
const child=spawn(exe,['--server','--world',root,'--config',path.join(root,'qa.conf'),'--port',String(port),'--logfile',path.join(root,'engine.log')],{cwd:path.dirname(exe),windowsHide:true,stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',b=>{log+=b;process.stdout.write(b);});child.stderr.on('data',b=>{log+=b;const clean=b.toString().split(/\r?\n/).filter(l=>!l.includes('No SHA256 known for builtin file')).join('\n');if(clean.trim())process.stderr.write(clean+'\n');});
const timer=setTimeout(()=>child.kill(),120000);
try {const code=await new Promise((resolve,reject)=>{child.once('close',resolve);child.once('error',reject);});assert.equal(code,0,root);assert.ok(log.includes('qa-complete'),root);console.log('Four real Equestria towns generated successfully in Luanti. Logs:',root);}
finally{clearTimeout(timer);if(child.exitCode===null)child.kill();}
