import fs from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {availablePort,PONIES} from '../games.mjs';
import {atomicJSON} from '../profiles.mjs';
import {engineAssetsReady,readDefaultWorld,ENGINE_FOLDER} from './assets.mjs';
import {ensureTerrainCache,resetTerrainCache} from './terrain-cache.mjs';
import {controllerSettings} from './controller.mjs';
import {openViewDistanceBridge} from './view-distance.mjs';
import {openSceneryMedia} from './scenery-media.mjs';
import {fileURLToPath} from 'node:url';
import bossRoster from './bosses.json' with {type:'json'};

const sha=b=>createHash('sha256').update(b).digest('hex');
const bossIds=new Set(bossRoster.map(b=>b.id));
export function validState(value){
 if(!value || typeof value!=='object' || !Array.isArray(value.chests) || value.chests.length!==50)return false;
 if(!['rings','quests','bits'].every(k=>Number.isSafeInteger(value[k])&&value[k]>=0&&value[k]<=1e12))return false;
 if(value.books!==undefined && (!value.books || typeof value.books!=='object'||!Object.entries(value.books).every(([k,v])=>/^[1-7]$/.test(k)&&v===true)))return false;
 if(value.bosses!==undefined && (!value.bosses || typeof value.bosses!=='object'||!Object.entries(value.bosses).every(([k,v])=>bossIds.has(k)&&v===true)))return false;
 return value.chests.every(c=>c&&Number.isSafeInteger(c.sequence)&&c.sequence>=0&&c.sequence<=1e12&&Number.isSafeInteger(c.openedAt)&&c.openedAt>=0&&c.openedAt<=8.64e15&&(c.sequence===0?c.openedAt===0:c.openedAt>0));
}
function validIdentity(value){return value&&typeof value.uid==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value.uid)&&typeof value.displayName==='string'&&value.displayName.length>=1&&value.displayName.length<=24&&PONIES.adventure.includes(value.pony)&&validState(value.state);}
async function files(root,prefix=''){
 const result=[];for(const entry of await fs.readdir(path.join(root,prefix),{withFileTypes:true})){const name=path.join(prefix,entry.name);if(entry.isDirectory())result.push(...await files(root,name));else result.push(name);}return result.sort();
}
async function linkTree(source,destination){
 await fs.mkdir(destination,{recursive:true});
 for(const file of await files(source)){
  const target=path.join(destination,file);await fs.mkdir(path.dirname(target),{recursive:true});
  try {await fs.link(path.join(source,file),target);}catch(e){if(e.code==='EEXIST')continue;if(e.code!=='EXDEV'&&e.code!=='EPERM')throw e;await fs.copyFile(path.join(source,file),target);}
 }
}
export class EquestriaGame {
 running=null; imported=null;
 constructor(nativeRoot,profileRoot,send,{headless=false}={}){
  this.root=nativeRoot;this.profileRoot=profileRoot;this.send=send;this.headless=headless;
  this.engine=path.join(nativeRoot,ENGINE_FOLDER);this.exe=path.join(this.engine,'bin','luanti.exe');
 }
 async status(){
  const engine=await engineAssetsReady(this.root);
  let world=null,folder=null;
  try{const bundled=await readDefaultWorld(this.root);world=bundled.info;folder=bundled.root;}catch{}
  this.imported=folder;
  let build;
  if(engine&&world){
   if(!this.gameplayHash){
    this.gameplayReady ||= (async()=>{
    const digest=createHash('sha256'),game=path.join(this.engine,'games','ponyhaven');digest.update(await fs.readFile(this.exe));this.mediaFiles=[];this.sceneryMedia=new Map();
    const names=await files(game);
    for(let start=0;start<names.length;start+=64){
     const batch=names.slice(start,start+64),contents=await Promise.all(batch.map(file=>fs.readFile(path.join(game,file))));
     for(let i=0;i<batch.length;i++){
     const file=batch[i],name=file.replaceAll('\\','/'),source=path.join(game,file),data=contents[i];digest.update(name);digest.update(data);
     if(/\/(models|textures|sounds)\//.test(name)&&/\.(obj|png|jpg|tga|ogg|b3d|gltf|glb|x)$/i.test(name)){
      const hash=createHash('sha1').update(data).digest('hex');this.mediaFiles.push({source,hash});this.sceneryMedia.set(hash,{source,bytes:data.length});
     }
    }
    }
    const mod=path.join(game,'mods/ponyhaven'),scenery=JSON.parse(await fs.readFile(path.join(mod,'horizon.json'),'utf8'));
    for(const tile of scenery.tiles)for(const model of [tile,tile.low].filter(Boolean))this.sceneryMedia.set(model.sha1,{source:path.join(mod,'scenery',model.mesh+'.deflate'),bytes:model.bytes,compressed:true});
    this.gameplayHash=digest.digest('hex');
    })().catch(error=>{this.gameplayReady=null;throw error;});
    await this.gameplayReady;
   }
   build={protocol:1,worldHash:world.worldHash,gameplayHash:this.gameplayHash};
  }
  return {engine,world:!!world,build,title:'Equestria 6 · Update 8'};
 }
 async seedMediaCache(){
  // Luanti verifies these SHA-1-addressed files against the host announcement.
  // Reuse the bundled models locally instead of retransmitting ~180 MB over
  // an invite-code connection. Copies avoid mutable links to shipped assets.
  const cache=path.join(this.engine,'cache','media');await fs.mkdir(cache,{recursive:true});
  const present=new Set(await fs.readdir(cache));
  for(const {source,hash} of this.mediaFiles||[])if(!present.has(hash)){
   try{await fs.copyFile(source,path.join(cache,hash),fsConstants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;}
   present.add(hash);
  }
 }
 async writeBridge(r){
  r.revision++;
  const revision=r.revision;
  r.writes=r.writes.catch(()=>{}).then(()=>atomicJSON(path.join(r.world,'bridge.json'),{session:r.session,revision,players:[...r.identities.values()],acks:[...r.acks.values()],inputs:r.inputs||[],viewRanges:r.viewRanges||{},stop:r.stopping}));
  await r.writes;return revision;
 }
 async waitFor(r,condition,message,timeout=30000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(condition())return;if(r.failed||r.closedServer)throw Error(r.error||message);await new Promise(resolve=>setTimeout(resolve,50));}
  throw Error(message);
 }
 async invite(peer,identity){
  const r=this.running;if(!r||r.mode==='join'||r.stopping)throw Error('Host Equestria first.');
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(peer)||!validIdentity(identity))throw Error('Invalid Equestria invitation.');
  const previous=r.peers.get(peer);if(previous)return {name:previous,password:r.identities.get(previous).password};
  if(r.identities.size>=8)throw Error('The Equestria party is full.');
  const name='ph_'+sha(identity.uid).slice(0,16);
  if(r.identities.has(name))throw Error('This profile is already in the Equestria world.');
  const entry={...structuredClone(identity),name,password:randomBytes(24).toString('hex')};r.identities.set(name,entry);r.peers.set(peer,name);
  const revision=await this.writeBridge(r);await this.waitFor(r,()=>r.readyRevision>=revision,'The game did not accept the invitation.');
  return {name,password:entry.password};
 }
 async revoke(peer){
  const r=this.running;if(!r||r.mode==='join'||r.stopping)return;
  const name=r.peers.get(peer);if(!name)return;
  r.peers.delete(peer);r.identities.delete(name);r.acks.delete(name);
  const revision=await this.writeBridge(r);
  // Wait for the live server to remove the old identity before a rejoin can
  // recreate it. Otherwise the old player can linger until the UDP timeout.
  await this.waitFor(r,()=>r.readyRevision>=revision&&!r.joined.has(name),'The departing pony did not disconnect.',5000);
 }
 playerForPeer(peer){return this.running?.peers.get(peer)||null;}
 async input(peer,book,session){
  const r=this.running;if(!r || r.mode==='join' || r.stopping || r.session!==session || !Number.isInteger(book)||book<1||book>7)return;
  const player=peer?r.peers.get(peer):r.own;if(!player||!r.joined.has(player))return;
  r.inputs ||= [];r.inputSequence=(r.inputSequence||0)+1;
  r.inputs.push({player,book,sequence:r.inputSequence});r.inputs=r.inputs.slice(-128);await this.writeBridge(r);
 }
 startKeys(r){
  if(this.headless)return;
  const helper=path.join(path.dirname(fileURLToPath(import.meta.url)),'keys.ps1');
  r.keys=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-GameProcessId',String(r.client.pid)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let buffer='';r.keys.stdout.on('data',data=>{buffer+=data;let end;while((end=buffer.indexOf('\n'))>=0){const book=Number(buffer.slice(0,end).trim());buffer=buffer.slice(end+1);if(!Number.isInteger(book)||book<1||book>7)continue;
   if(r.mode==='join')this.send({kind:'input',session:r.session,book});else void this.input(null,book,r.session);
  }});
  r.keys.on('error',e=>{r.logs.push('Book controls: '+e.message);this.send({kind:'notice',session:r.session,message:'Book keys could not start. Reopen Equestria to restore 1–7 controls.'});});
  r.keys.stderr.on('data',data=>r.logs.push('Book controls: '+data.toString()));
 }
 async acknowledge(player,state){
  const r=this.running;if(!r||r.mode==='join'||!r.identities.has(player)||!validState(state))throw Error('Invalid Equestria save acknowledgement.');
  r.acks.set(player,{player,state:structuredClone(state)});r.identities.get(player).state=structuredClone(state);await this.writeBridge(r);
 }
 async launch(options,profile){
  if(this.running||this.launching)throw Error('Close your current Equestria adventure first.');
  this.launching=true;
  try{return await this.launchWorld(options,profile);}finally{this.launching=false;}
 }
 async launchWorld(options,profile){
  const {pony,mode,fullscreen,state}=options||{};
  const saveId=options?.saveId||'legacy';if(typeof saveId!=='string'||!/^[a-zA-Z0-9_-]{1,40}$/.test(saveId))throw Error('Choose a valid adventure save.');
  const identityId=profile.id+(saveId==='legacy'?'':'_'+saveId);
  if(!PONIES.adventure.includes(pony)||!['solo','host','join'].includes(mode)||typeof fullscreen!=='boolean'||!validState(state))throw Error('Choose your pony before opening Equestria.');
  const status=await this.status();
  if(!status.engine)throw Error('Equestria engine files are missing. Extract the complete Ponyhaven folder again, including its shaders.');
  if(!status.world)throw Error('The included Equestria map is incomplete. Extract the complete Ponyhaven folder again.');
  if(mode==='join'&&(!Number.isInteger(options.port)||options.port<1024||options.port>65535||!options.ticket||!/^ph_[a-f0-9]{16}$/.test(options.ticket.name)||!/^[a-f0-9]{48}$/.test(options.ticket.password)||!readSession(options.session)))throw Error('Join Equestria through your party invite code.');
  if(mode==='join'&&(!options.build||Object.keys(status.build).some(k=>options.build[k]!==status.build[k])))throw Error('Your Equestria world or game files differ from the host.');
  const session=mode==='join'?options.session:randomUUID(),port=mode==='join'?options.port:await availablePort();
  const folder=path.join(this.profileRoot,'profiles',profile.id,'equestria'),world=path.join(folder,status.build.worldHash);
  await fs.mkdir(folder,{recursive:true});
  const r={session,port,mode,world,folder,own:'',identities:new Map(),peers:new Map(),acks:new Map(),revision:0,readyRevision:0,writes:Promise.resolve(),joined:new Set(),stopping:false,failed:false,logs:[],build:status.build,closedServer:false};
  this.running=r;this.send({kind:'loading',session});
  try{
   await this.seedMediaCache();
   r.media=await openSceneryMedia(this.gameplayHash,this.sceneryMedia);
   if(mode!=='join'){
    await linkTree(this.imported,path.join(world,'imported'));
    await ensureTerrainCache(world);
    await resetTerrainCache(world);
    await fs.writeFile(path.join(world,'world.mt'),'gameid = ponyhaven\nbackend = sqlite3\nplayer_backend = sqlite3\nauth_backend = sqlite3\nmod_storage_backend = sqlite3\n');
    r.own='ph_'+sha(identityId).slice(0,16);
    r.identities.set(r.own,{name:r.own,password:randomBytes(24).toString('hex'),uid:identityId,displayName:profile.name.slice(0,24),pony,state:structuredClone(state)});
    await this.writeBridge(r);
    const config=path.join(world,'server.conf');
    await fs.writeFile(config,`bind_address = 127.0.0.1\nserver_announce = false\nname = PonyhavenHost\nmg_name = singlenode\nchunksize = 2\nnum_emerge_threads = 1\nmax_users = ${mode==='host'?8:1}\nmax_simultaneous_block_sends_per_client = 12\nmax_block_send_distance = 256\nmax_block_generate_distance = 256\nactive_object_send_range_blocks = 2000\nactive_block_range = 6\nserver_side_occlusion_culling = true\nstrict_protocol_version_checking = true\nmovement_speed_walk = 8\nmovement_acceleration_default = 4\nmovement_speed_jump = 10\nmovement_gravity = 18\nenable_damage = false\nenable_pvp = false\ndisable_anticheat = true\nponyhaven_session = ${session}\nponyhaven_smooth = false\n`);
    if(r.media)await fs.appendFile(config,`remote_media = http://127.0.0.1:${r.media.port}/\n`);
    r.server=this.process(r,'server',['--server','--world',world,'--config',config,'--port',String(port),'--logfile',path.join(folder,'server.log')],true);
    await this.waitFor(r,()=>r.ready&&r.readyRevision>=1,'Equestria did not finish loading. See server.log in this profile.');
    r.viewport=await openViewDistanceBridge(port,(name,range)=>{
     if(r.stopping||!r.identities.has(name))return;
     (r.viewRanges||={})[name]=Math.min(1024,Math.max(32,range));void this.writeBridge(r).catch(()=>{});
    });r.port=r.viewport.port;
   }else r.own=options.ticket.name;
   const ticket=mode==='join'?options.ticket:r.identities.get(r.own),clientDir=path.join(folder,'client-'+session);
   await fs.mkdir(clientDir,{recursive:true});const passwordFile=path.join(clientDir,'session-password.txt');
   await fs.writeFile(passwordFile,ticket.password,{mode:0o600});
   const config=path.join(clientDir,'client.conf');
   await fs.writeFile(config,`screen_w = 1280\nscreen_h = 800\nfullscreen = ${fullscreen}\nwindow_maximized = false\nvsync = true\nfps_max = 60\nviewing_range = 512\nmax_block_send_distance = 256\nenable_clouds = true\nenable_fog = true\nfov = 72\nenable_minimap = ${!this.headless}\nminimap_shape_round = false\ntexture_min_size = 16\nvideo_driver = ${this.headless?'null':'opengl3'}\nenable_sound = ${!this.headless}\nenable_post_processing = false\nenable_shaders = false\nkeymap_forward = SYSTEM_SCANCODE_26\nkeymap_backward = SYSTEM_SCANCODE_22\nkeymap_left = SYSTEM_SCANCODE_4\nkeymap_right = SYSTEM_SCANCODE_7\nkeymap_jump = SYSTEM_SCANCODE_44\nkeymap_aux1 = SYSTEM_SCANCODE_27\nkeymap_zoom = SYSTEM_SCANCODE_8\nkeymap_sneak = SYSTEM_SCANCODE_12\nkeymap_inventory = SYSTEM_SCANCODE_43\nkeymap_chat = SYSTEM_SCANCODE_23\nkeymap_camera_mode = SYSTEM_SCANCODE_64\ncinematic = false\nmouse_sensitivity = 0.15\ncamera_mode = third\n`);
   await fs.appendFile(config,`shader_path = ${path.join(this.engine,'games/ponyhaven/mods/ponyhaven/shaders').replaceAll('\\','/')}\n`);
   await fs.appendFile(config,`enable_remote_media_server = ${!!r.media}\n`);
   await fs.appendFile(config,controllerSettings());
   r.client=this.process(r,'client',['--go','--info','--address','127.0.0.1','--port',String(r.port),'--name',r.own,'--password-file',passwordFile,'--config',config,'--logfile',path.join(folder,'client.log')],this.headless);
   r.passwordFile=passwordFile;
   if(mode!=='join')await this.waitFor(r,()=>r.joined.has(r.own),'Your pony could not join Equestria. See client.log in this profile.',45000);
   else await this.waitFor(r,()=>r.clientConnected,'Could not join the host’s Equestria world.',45000);
   await fs.unlink(passwordFile).catch(()=>{});
   this.startKeys(r);
   this.send({kind:'started',session,player:r.own,build:status.build});
   return {session,port:r.port,player:r.own,build:status.build};
  }catch(error){r.failed=true;r.error=error.message;await this.stop();throw error;}
 }
 process(r,role,args,hidden){
  const child=spawn(this.exe,args,{cwd:path.join(this.engine,'bin'),windowsHide:hidden,stdio:['ignore','pipe','pipe']});
  let buffer='';
  const read=b=>{
   const text=b.toString();r.logs.push(text);if(r.logs.length>100)r.logs.shift();
   if(role==='client'&&/Access denied|Connection timed out/.test(text)){r.error='Equestria could not connect. See client.log in this profile.';}
   if(role==='client'&&text.includes('CHAT: Welcome to Equestria!'))r.clientConnected=true;
   buffer+=text;if(buffer.length>65536)buffer=buffer.slice(-32768);
   let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);
    if(role!=='server'||!line.startsWith('PONYHAVEN_EQUESTRIA '))continue;
    let event;try{event=JSON.parse(line.slice(19));}catch{continue;}if(event.session!==r.session)continue;
    if(event.kind==='ready')r.ready=true;
    if(event.kind==='registry'&&Number.isInteger(event.revision))r.readyRevision=Math.max(r.readyRevision,event.revision);
    if(event.kind==='joined'&&r.identities.has(event.player)){r.joined.add(event.player);this.send(event);}
    if(event.kind==='left')r.joined.delete(event.player);
    if(event.kind==='reward'&&r.identities.has(event.player)&&event.event)this.send({...event,own:event.player===r.own});
   }
  };
  child.stdout.on('data',read);child.stderr.on('data',read);
  child.on('error',e=>{r.failed=true;r.error=e.message;});
  child.on('close',code=>{
   if(role==='server')r.closedServer=true;
   if(!r.stopping){if(code!==0){r.failed=true;r.error='Equestria closed unexpectedly. Your saved collection is safe.';}void this.stop();}
  });
  return child;
 }
 async stop(){
  const r=this.running;if(!r)return;if(r.stopPromise)return r.stopPromise;
  r.stopping=true;r.stopPromise=(async()=>{
   if(r.keys&&r.keys.exitCode===null)r.keys.kill();
   if(r.client&&r.client.exitCode===null)r.client.kill();
   if(r.server&&r.server.exitCode===null){await this.writeBridge(r).catch(()=>{});const end=Date.now()+2500;while(r.server.exitCode===null&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,50));if(r.server.exitCode===null)r.server.kill();}
   // A new world must not reset SQLite while the previous process still owns it.
   await Promise.all([r.server,r.client,r.keys].filter(child=>child&&child.exitCode===null&&child.signalCode===null).map(child=>new Promise(resolve=>child.once('exit',resolve))));
   if(r.passwordFile)await fs.unlink(r.passwordFile).catch(()=>{});
   r.viewport?.close();
   if(r.media)await r.media.close();
   if(this.running===r)this.running=null;
   this.send({kind:r.failed?'error':'ended',session:r.session,message:r.failed?r.error:'Equestria closed. Your collection is saved.'});
  })();return r.stopPromise;
 }
}
function readSession(value){return typeof value==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);}
