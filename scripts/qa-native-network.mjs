// End-to-end engine protocol test over the same UDP relay used by PeerJS.
import { NativeGames } from '../desktop/games.mjs';
import { LocalRelay } from '../desktop/relay.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
process.env.SDL_VIDEODRIVER='dummy';process.env.SDL_RENDER_DRIVER='software';process.env.SDL_AUDIODRIVER='dummy';
const root=path.resolve('tmp/native-network-'+Date.now());
console.log(root);
for(const game of process.argv.includes('--kart')?['ponykart']:['adventure','ponykart']) {
 const snapshots={};
 const host=new NativeGames(path.resolve('native'),root,e=>{if(e.type==='progress')snapshots.host=e;});
 const guest=new NativeGames(path.resolve('native'),root,e=>{if(e.type==='progress')snapshots.guest=e;});
 let a,b;
 a=new LocalRelay(p=>b.send('host',p.bytes));b=new LocalRelay(p=>a.send('guest',p.bytes));
 try {
  const h=await host.launch({game,pony:'twilight',map:1,mode:'host',fullscreen:false},{id:'host',name:'Host'});
  await until(()=>snapshots.host,15000);
  await a.open({role:'host',id:'guest',port:h.port});
  const port=await b.open({role:'guest',id:'host'});
  await guest.launch({game,pony:'applejack',map:1,mode:'join',fullscreen:false,port},{id:'guest',name:'Guest'});
  await until(()=>snapshots.host?.players===2 && snapshots.guest?.players===2,30000);
  const elapsed=snapshots.host.elapsed;
  await until(()=>snapshots.host.elapsed>elapsed+70,10000);
  assert.equal(snapshots.host.players,2);console.log(game,'Two players connected and simulation advanced',snapshots);
 } finally {
  await guest.stop();await host.stop();a.close();b.close();
 }
}
async function until(fn,ms) {const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,200));}throw Error('Native network timed out; logs: '+root);}
