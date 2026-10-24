import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import dgram from 'node:dgram';
import { username } from '../desktop/license.mjs';
import { Profiles } from '../desktop/profiles.mjs';
import { inspectLevel, LevelLibrary, mapNumber } from '../desktop/levels.mjs';
import { LocalRelay } from '../desktop/relay.mjs';
import { guardNavigation } from '../desktop/navigation.mjs';
import { NativeProgress } from '../desktop/native-progress.mjs';
const product='test-product',key='INVITATION-FOR-UNIT-TEST';
const progressSession='00000000-0000-0000-0000-000000000001';
const progressRecord={session:progressSession,rings:4,score:200,map:1,elapsed:150,laps:0,players:1,finished:false};
const progressLine=value=>'PONYHAVEN_PROGRESS '+JSON.stringify(value)+'\n';
test('native pipe handles arbitrary chunk boundaries and final completion without a file',()=>{
  const received=[],reader=new NativeProgress(progressSession,d=>received.push(d));
  const first=progressLine(progressRecord);
  for(const byte of first)reader.push(byte);
  reader.push(first); // Repeated snapshots must not duplicate a notification.
  reader.push(progressLine({...progressRecord,finished:true}).trimEnd());
  reader.end();
  assert.deepEqual(received,[progressRecord,{...progressRecord,finished:true}]);
});
test('native pipe rejects foreign sessions, corrupt data and injected event fields',()=>{
  const received=[],reader=new NativeProgress(progressSession,d=>received.push(d));
  reader.push('ordinary engine log\nPONYHAVEN_PROGRESS {broken}\n');
  for(const invalid of [
    {...progressRecord,session:'another-session'}, {...progressRecord,rings:-1},
    {...progressRecord,map:2000}, {...progressRecord,players:0},
    {...progressRecord,finished:'true'}, {...progressRecord,score:1e20},
  ])reader.push(progressLine(invalid));
  reader.push(progressLine({...progressRecord,type:'error',game:'other',pack:'unexpected'}));
  assert.deepEqual(received,[progressRecord]);
});
test('native pipe bounds unfinished input and recovers after oversized lines',()=>{
  const received=[],reader=new NativeProgress(progressSession,d=>received.push(d));
  reader.push('x'.repeat(5000));assert.ok(reader.buffer.length<=4096);
  reader.push('continued oversized line\n'+progressLine(progressRecord));
  reader.push('PONYHAVEN_PROGRESS '+'x'.repeat(5000)+'\n');
  reader.push(progressLine({...progressRecord,rings:5}));
  assert.equal(received.length,2);assert.equal(received[1].rings,5);
});
test('desktop permits profile reloads and still blocks leaving the bundled app',()=>{
  for (const url of ['ponyhaven://app/', 'ponyhaven://app/#home', 'ponyhaven://app/index.html#shop']) {
    let blocked = false;
    guardNavigation({url, preventDefault:()=>{blocked=true;}});
    assert.equal(blocked,false,`App reload must be allowed: ${url}`);
  }
  for (const url of ['https://example.com/', 'file:///C:/test.html', 'javascript:alert(1)',
    'ponyhaven://other/', 'ponyhaven://app.evil/', 'ponyhaven://user@app/',
    'ponyhaven://app/data/cards.json', 'ponyhaven://app/?outside=true', 'invalid']) {
    let blocked = false;
    guardNavigation({url, preventDefault:()=>{blocked=true;}});
    assert.equal(blocked,true,`Unexpected page must be blocked: ${url}`);
  }
  let blocked = false;
  guardNavigation({preventDefault:()=>{blocked=true;}},'ponyhaven://app/');
  assert.equal(blocked,false);
});
test('profile names reject paths and empty values',()=>{
 assert.throws(()=>username('../profile'));assert.throws(()=>username('a'));assert.equal(username('  Friend  '),'Friend');
});
test('profiles survive restart, serialize saves, isolate names, and back up before reset',async()=>{
  const root=await fs.mkdtemp(path.resolve('tmp/profile-test-'));
  // Unit adapter only. Electron production uses the operating system's safeStorage.
  const encryption={isEncryptionAvailable:()=>true,encryptString:(s)=>Buffer.from(s),decryptString:(b)=>b.toString()};
  const p=new Profiles(root,encryption,product);await p.init();
  assert.throws(()=>p.requireActive());
  await p.create('First Friend');const id=p.requireActive().id;
  const save={version:1,coins:10,collection:{},ponyProgress:{},petUnlocks:[]};
  await Promise.all([p.write(save),p.write({...save,coins:20}),p.write({...save,coins:30})]);
  assert.equal((await p.read()).coins,30);
  await p.backup();await p.rename('Renamed Friend');await p.create('Second Friend');
  assert.equal(await p.read(),null);await p.select(id);assert.equal((await p.read()).coins,30);
  const restart=new Profiles(root,encryption,product);await restart.init();
  assert.equal(restart.status().activated,true);assert.equal(restart.requireActive().name,'Renamed Friend');
  await assert.rejects(restart.create('second friend'),/already/);
  await assert.rejects(restart.select('../invalid'));
});
function wad(lumps){
  let offset=12;const directory=Buffer.alloc(lumps.length*16),body=[];
  lumps.forEach(([name,bytes],i)=>{const b=Buffer.from(bytes);directory.writeUInt32LE(offset,i*16);directory.writeUInt32LE(b.length,i*16+4);directory.write(name,i*16+8,8,'ascii');offset+=b.length;body.push(b);});
  const header=Buffer.alloc(12);header.write('PWAD');header.writeUInt32LE(lumps.length,4);header.writeUInt32LE(offset,8);return Buffer.concat([header,...body,directory]);
}
test('map import accepts level data and rejects scripts, characters, oversized and broken archives',()=>{
  const data=wad([['MAP01',''],['THINGS',''],['MAINCFG','LEVEL 1\nLEVELNAME = Cloud garden\n\n']]);
  assert.deepEqual(inspectLevel(data,'.wad'),[{id:1,name:'Cloud garden'}]);
  assert.equal(mapNumber('MAPA0'),100);assert.equal(mapNumber('MAPZZ'),1035);
  for(const lump of ['LUA_TEST','S_SKIN','PLAYPAL'])assert.throws(()=>inspectLevel(wad([['MAP01',''],[lump,'x']]),'.wad'));
  assert.throws(()=>inspectLevel(wad([['MAP01',''],['MAINCFG','MAINCFG\nGAMEDATA = bad.dat\n']]),'.wad'));
  assert.throws(()=>inspectLevel(Buffer.from('not a wad'),'.wad'));
  assert.throws(()=>inspectLevel(Buffer.alloc(22),'.pk3'));
});
test('import library deduplicates packs and checks host checksum without arbitrary paths',async()=>{
  const root=await fs.mkdtemp(path.resolve('tmp/level-test-')),profile={id:'local-profile'};
  const filename=path.join(root,'Cloud garden.wad');await fs.writeFile(filename,wad([['MAP01',''],['THINGS','']]));
  const library=new LevelLibrary(root);
  const [pack]=await library.add(profile,'adventure',filename);
  assert.equal((await library.add(profile,'adventure',filename)).length,1);
  assert.equal((await library.list(profile,'ponykart')).length,0);
  assert.match(await library.resolve(profile,'adventure',pack.id,1),/\.wad$/);
  await assert.rejects(library.resolve(profile,'adventure','../escape',1));
  await assert.rejects(library.resolve(profile,'adventure',pack.id,2));
  await library.remove(profile,'adventure',pack.id);assert.equal((await library.list(profile,'adventure')).length,0);
});
test('loopback bridge carries an engine UDP exchange in both directions',async()=>{
  const host=dgram.createSocket('udp4'),guest=dgram.createSocket('udp4');
  await Promise.all([new Promise(r=>host.bind(0,'127.0.0.1',r)),new Promise(r=>guest.bind(0,'127.0.0.1',r))]);
  let a,b;
  a=new LocalRelay(p=>b.send('host',p.bytes));b=new LocalRelay(p=>a.send('guest',p.bytes));
  try {
    await a.open({role:'host',id:'guest',port:host.address().port});const port=await b.open({role:'guest',id:'host'});
    host.on('message',(bytes,r)=>{assert.equal(bytes.toString(),'hello engine');host.send(Buffer.from('welcome pony'),r.port,r.address);});
    const reply=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('UDP bridge timeout')),3000);guest.once('message',b=>{clearTimeout(timer);resolve(b.toString());});});
    guest.send(Buffer.from('hello engine'),port,'127.0.0.1');assert.equal(await reply,'welcome pony');
  } finally {a.close();b.close();host.close();guest.close();}
});
