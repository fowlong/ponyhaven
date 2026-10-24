// Exercise the actual OpenGL renderer using the packaged runtime, without UI input.
import fs from 'node:fs/promises';
import {appendFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {EquestriaGame} from '../desktop/equestria/runtime.mjs';
import {includeRuntimeFile,ENGINE_FOLDER} from '../desktop/equestria/assets.mjs';
const packaged=path.resolve(process.argv[2]||'release/Ponyhaven-0.3.0-win32-x64/resources/app/native/equestria');
const root=path.resolve('tmp/equestria-renderer-qa-'+Date.now());
const native=path.join(root,'native');
async function stage(from,to){
 await fs.mkdir(to,{recursive:true});
 for(const e of await fs.readdir(from,{withFileTypes:true})){
  const relative=path.relative(path.join(packaged,ENGINE_FOLDER),path.join(from,e.name));
  if(!relative.startsWith('..')&&!includeRuntimeFile(relative))continue;
  assert.ok(!e.isSymbolicLink(),'Unexpected package symlink');
  if(e.isDirectory())await stage(path.join(from,e.name),path.join(to,e.name));
  else await fs.link(path.join(from,e.name),path.join(to,e.name));
 }
}
await stage(packaged,native);
const game=new EquestriaGame(native,root,e=>{if(['started','error'].includes(e.kind))console.log(e.kind,e.message||'');});
let rendererLog='';const launchProcess=game.process.bind(game);
const range=Number(process.argv[3]||512);assert.ok(range>=32&&range<=1024);
game.process=(r,role,args,hidden)=>{
 if(role==='client')appendFileSync(args[args.indexOf('--config')+1],`profiler_print_interval = 5\nfps_max_unfocused = 60\nviewing_range = ${range}\n`);
 const child=launchProcess(r,role,args,hidden);if(role==='client'){child.stdout.on('data',b=>rendererLog+=b);child.stderr.on('data',b=>rendererLog+=b);}return child;
};
const fresh={chests:Array.from({length:50},()=>({openedAt:0,sequence:0})),rings:0,quests:0,bits:0};
try{
 const status=await game.status();assert.ok(status.engine&&status.world,'Fresh profile must use the bundled map.');
 const world=path.join(root,'profiles/render-check/equestria',status.build.worldHash),mod=path.join(world,'worldmods/render_qa');await fs.mkdir(mod,{recursive:true});
 await fs.writeFile(path.join(mod,'mod.conf'),'name = render_qa\ndepends = ponyhaven\n');
 await fs.writeFile(path.join(mod,'init.lua'),`
 local ph=ponyhaven;local elapsed=0;local moved=false;local smooth={calls=0,us=0,max_us=0};local original=ph.smooth_volume
 ph.smooth_volume=function(...)local t=core.get_us_time();local r=original(...);local us=core.get_us_time()-t;smooth.calls=smooth.calls+1;smooth.us=smooth.us+us;smooth.max_us=math.max(smooth.max_us,us);return r end
 core.register_globalstep(function(dt)elapsed=elapsed+dt;if elapsed<1 then return end;elapsed=0
  local p=core.get_connected_players()[1];if not p then return end;local name=p:get_player_name();local selection=ph.horizon_selection[name];if not selection then return end
  if not moved then if not ph.players[name].travel then moved=true;ph.travel(p,ph.locations.towns[3])end;return end
  if ph.players[name].travel or p:get_pos().z<1600 then return end
  local ready=0;for _,o in pairs(ph.horizon_tiles)do if o:get_observers()[name]then ready=ready+1 end end
  core.safe_file_write(core.get_worldpath()..'/render-stats.json',core.write_json({selection=selection,ready=ready,media=ph.horizon_metrics,smooth=smooth,pos=p:get_pos()}))
 end)
 `);
 await game.launch({pony:'twilight',mode:'solo',fullscreen:false,state:fresh},{id:'render-check',name:'Renderer check'});
 let stats;const deadline=Date.now()+45000;while(Date.now()<deadline){
  stats=JSON.parse(await fs.readFile(path.join(world,'render-stats.json'),'utf8').catch(()=> 'null'));
  if(stats&&stats.ready>=stats.selection.tiles)break;await new Promise(r=>setTimeout(r,250));
 }
 await new Promise(r=>setTimeout(r,5500));
 assert.ok(game.running&&!game.running.failed&&game.running.client.exitCode===null,'Graphical client exited early.');
 const localMedia=game.running.media?.stats();assert.ok(localMedia&&(localMedia.shared||localMedia.requests>=16),'Bundled scenery was not fetched locally.');
 assert.equal(game.running.viewRanges[game.running.own],Math.ceil(range/16)*16,'Actual client range did not reach the host');
 assert.equal(stats.selection.range,Math.ceil(range/16)*16);assert.ok(stats.ready>=stats.selection.tiles*.9,'Scenery loading did not converge');
 assert.ok(stats.pos.z>1600&&stats.pos.y>220,'Renderer did not reach Cloudsdale');assert.equal(stats.smooth.calls,0,'Disabled NoCube ran during rendering');
 const log=rendererLog+'\n'+await fs.readFile(path.join(root,'profiles/render-check/equestria/client.log'),'utf8');await fs.writeFile(path.join(root,'renderer-output.log'),rendererLog);
 assert.ok(/OpenGL|opengl3/.test(log),'Actual OpenGL renderer was not initialized.');
 assert.ok(log.includes('Received media announcement:')&&!/media request list to server|Received files: bunch/.test(log),'Bundled game media was requested over the network instead of reusing the local files.');
 for(const name of ['nodes_shader','object_shader','cloud_shader'])assert.ok(log.includes('mods/ponyhaven/shaders\\'+name),'Packaged horizon shader override was not loaded: '+name);
 assert.ok(!/shader[^\r\n]*(?:not found|failed|error)|(?:failed|error)[^\r\n]*shader|ERROR\[Main\]/i.test(log),'Graphical runtime reported an error: '+log.split(/\r?\n/).filter(l=>/ERROR|shader/i.test(l)).slice(-12).join('\n'));
 console.log('Native OpenGL Equestria passed:',JSON.stringify(stats),'; local media',JSON.stringify(localMedia),'; live range, shader loading, world join. Logs:',root);
 console.log(rendererLog.split(/\r?\n/).filter(l=>/Client: mainloop|Irr: drawcalls|Irr: primitives|RenderingEngine|Draw scene/.test(l)).slice(-20).join('\n'));
}finally{await fs.writeFile(path.join(root,'renderer-output.log'),rendererLog);await game.stop();}
