import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import dgram from 'node:dgram';
import { readFileSync } from 'node:fs';
import { NativeProgress } from './native-progress.mjs';

export const PONIES = {
  adventure: ['twilight','applejack','fluttershy','rarity','derpy','luna','trixie'],
  ponykart: ['twilight','applejack','fluttershy','rarity','rainbowdash','pinkiepie'],
};
// Equestria also has ponies that the SRB2 Bonus stages engine has no sprites for.
export const EQUESTRIA_PONIES = [...PONIES.adventure,'pinkiepie','rainbowdash'];
export const COLOURS = {twilight:'Dusk',applejack:'Tangerine',fluttershy:'Lemonade',rarity:'White',rainbowdash:'Cerulean',pinkiepie:'Pink'};
export function controls(game) {
  const bindings = game==='adventure' ? {forward:['w'],backward:['s'],strafeleft:['a'],straferight:['d'],turnleft:['LEFT ARROW'],turnright:['RIGHT ARROW'],jump:['SPACE','JOY1'],spin:['x','JOY2']} :
    {accelerate:['w','UP ARROW'],brake:['s','DOWN ARROW'],turnleft:['a','LEFT ARROW'],turnright:['d','RIGHT ARROW'],drift:['SPACE','JOY11'],fire:['x','JOY10']};
  // Reverse-gravity courses need the chase camera to follow the pony's up axis.
  // Reapply at launch so existing profiles with the old default are fixed too.
  const gravityCamera = game==='adventure' ? 'flipcam 1\nflipcam2 1\n' : '';
  return Object.entries(bindings).map(([action,keys])=>`setcontrol "${action}" ${keys.map((key)=>`"${key}"`).join(' ')}`).join('\n')+'\nuse_mouse 0\nshowhud 1\nchasecam 1\n'+gravityCamera;
}
// Levels are explicit: no command strings or arbitrary addon paths enter IPC.
const courses=JSON.parse(readFileSync(new URL('./courses.json',import.meta.url),'utf8'));
export const MAPS=Object.fromEntries(Object.entries(courses).map(([game,list])=>[game,list.map(([id])=>id)]));
export async function availablePort() {
  const socket = dgram.createSocket('udp4');
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.bind(0,'127.0.0.1',resolve); });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}
export class NativeGames {
  running = null;
  constructor(root, profileRoot, send, levels) { this.root = root; this.profileRoot = profileRoot; this.send = send; this.levels=levels; }
  async available() {
    return Object.fromEntries(await Promise.all(Object.keys(PONIES).map(async (game) =>
      [game, await fs.access(path.join(this.root,game,game+'.exe')).then(()=>true,()=>false)])));
  }
  async launch(options, profile) {
    const { game, pony, map, mode, fullscreen, pastel = 55 } = options || {};
    if (!Object.hasOwn(PONIES,game) || !PONIES[game].includes(pony) || !Number.isInteger(map) || map<1 || map>1035 ||
        !['solo','host','join'].includes(mode) || typeof fullscreen !== 'boolean' || !Number.isInteger(pastel) || pastel<0 || pastel>100) throw new Error('Choose a pony and a course first.');
    if (this.running) throw new Error('Close the current game before starting another.');
    const addon=options.pack ? await this.levels.resolve(profile,game,options.pack,map) : null;
    if(!addon && !MAPS[game].includes(map))throw new Error('Choose a built-in course or import its level pack.');
    if (!(await this.available())[game]) throw new Error('This game engine is missing. Run the native game preparation script.');
    if (mode === 'join' && (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535))
      throw new Error('The multiplayer connection is not ready.');
    const folder = path.join(this.profileRoot,'profiles',profile.id,game);
    const configFolder=path.join(folder,game==='adventure'?'srb2':'srb2kart');
    await fs.mkdir(path.join(configFolder,'screenshots'),{recursive:true});
    // Kart reads kartexec.cfg, while Adventure reads autoexec.cfg. Reapply the
    // UI mappings after each engine's saved config, including existing profiles.
    const startupConfig=game==='ponykart'?'kartexec.cfg':'autoexec.cfg';
    await fs.writeFile(path.join(configFolder,startupConfig),controls(game));
    const session = randomUUID();
    const port = mode === 'join' ? options.port : await availablePort();
    const args = ['-home',folder,'-skipintro','-bindaddr','127.0.0.1','-bindaddr6','::1','-ph-progress-stdio','-ph-session',session,
      '-ph-pastel',String(pastel),'-width','1280','-height','800',fullscreen ? '-fullscreen' : '-win',
      '+name',profile.name.replace(/[^a-zA-Z0-9 _.-]/g,'').slice(0,21) || 'Friend',
      '+skin',pony,'+use_mouse','0','+showhud','1'];
    if(game==='ponykart')args.push('+color',COLOURS[pony],'+netdemo_record','0');
    if(process.env.PONYHAVEN_QA_SILENT==='1')args.push('-nosound','-nomusic');
    if (mode === 'join') args.push('-connect','127.0.0.1:'+port,'-clientport',String(await availablePort()));
    else args.push('-warp',String(map),'-server','-port',String(port),'+maxplayers',mode === 'host' ? '8' : '1');
    args.push('-file',path.join(this.root,game,'ponyhaven.pk3'));
    if(addon)args.push(addon);
    const child = spawn(path.join(this.root,game,game+'.exe'), args, {
      // These are interactive GUI games. windowsHide also hides their SDL window.
      cwd:path.join(this.root,game), windowsHide:false, stdio:['ignore','pipe','pipe'],
    });
    let readyResolve,readyReject;
    const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
    const running = { child, game, session, port, pack:options.pack, stopped:false, ready:false, failed:false, stderr:'', snapshot:null, readyResolve, readyReject };
    running.closed=new Promise(resolve=>{running.closedResolve=resolve;});
    this.running = running;
    const progress = new NativeProgress(session, snapshot => {
      running.snapshot=snapshot;
      if (!running.ready) {
        running.ready=true;
        this.send({type:'started',game,session});
        readyResolve();
      }
      this.send({...snapshot,pack:running.pack,game,type:'progress'});
    });
    const record=(b)=>{running.stderr=(running.stderr+b.toString()).slice(-12000);};
    child.stdout.setEncoding('utf8');
    child.stderr.on('data',record);
    child.stdout.on('data',chunk=>{record(chunk);progress.push(chunk);});
    child.once('error', () => {running.failed=true;readyReject(new Error('The game could not start.')); this.send({ type:'error',game,session,message:'The game could not start.' }); this.cleanup(running); });
    // close, unlike exit, waits for stdout to drain, including final rewards.
    child.once('close', async (code) => {
      progress.end();
      await fs.writeFile(path.join(folder,'last-session.log'),running.stderr).catch(()=>{});
      readyReject(new Error('The game closed before its course was ready. See last-session.log in this profile.'));
      if(!running.failed)this.send({ type: code !== 0 && !running.stopped ? 'error':'ended',game,session,
        ...(code !== 0 && !running.stopped ? {message:'The game closed unexpectedly. Your saved rewards are safe.'} : {}) });
      this.cleanup(running);
      running.closedResolve();
    });
    this.send({type:'loading',game,session});
    const deadline=setTimeout(()=>readyReject(new Error('The game did not finish loading. See last-session.log in this profile.')),30000);
    try {await ready;}catch(error){await this.stop();throw error;}finally{clearTimeout(deadline);}
    return {session,port};
  }
  cleanup(r) { if(this.running===r) this.running=null; }
  async stop() {
    const r=this.running;
    if (!r) return;
    r.stopped=true;
    if(r.child.exitCode===null)r.child.kill();
    let timeout;
    await Promise.race([r.closed,new Promise(resolve=>{timeout=setTimeout(resolve,3000);})]);
    clearTimeout(timeout);
    this.cleanup(r);
  }
}
