import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import dgram from 'node:dgram';
import { verifyLicense, username } from '../desktop/license.mjs';
import { Profiles } from '../desktop/profiles.mjs';
import { inspectLevel, LevelLibrary, mapNumber } from '../desktop/levels.mjs';
import { LocalRelay } from '../desktop/relay.mjs';
import { guardNavigation } from '../desktop/navigation.mjs';
const product='test-product',key='INVITATION-FOR-UNIT-TEST';
const provider=(purchase={},status=200)=>async(_url,options)=>{
  assert.equal(options.body.get('increment_uses_count'),'false');
  assert.equal(options.body.get('product_id'),product);
  return new Response(JSON.stringify({success:status===200,purchase:{product_id:product,...purchase}}),{status});
};
test('desktop permits activation/profile reloads and still blocks leaving the bundled app',()=>{
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
test('Gumroad activation validates product, chargebacks, disabled keys, and failure modes',async()=>{
  const receipt=await verifyLicense(key,product,provider());
  assert.equal(receipt.productId,product);assert.match(receipt.fingerprint,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(receipt).includes(key));
  for(const p of [{product_id:'other'},{refunded:true},{chargebacked:true},{license_disabled:true},{disputed:true},{subscription_ended_at:'2026-01-01'}])
    await assert.rejects(verifyLicense(key,product,provider(p)));
  await assert.rejects(verifyLicense(key,product,provider({},429)),/busy/);
  await assert.rejects(verifyLicense(key,product,async()=>{throw Error('offline');}),/reach Gumroad/);
  assert.throws(()=>username('../profile'));assert.throws(()=>username('a'));assert.equal(username('  Friend  '),'Friend');
});
test('profiles survive restart, serialize saves, isolate names, and back up before reset',async()=>{
  const root=await fs.mkdtemp(path.resolve('tmp/profile-test-'));
  // Unit adapter only. Electron production uses the operating system's safeStorage.
  const encryption={isEncryptionAvailable:()=>true,encryptString:(s)=>Buffer.from(s),decryptString:(b)=>b.toString()};
  const p=new Profiles(root,encryption,product);await p.init();
  assert.throws(()=>p.requireActive());
  await p.activate(await verifyLicense(key,product,provider()),'First Friend');const id=p.requireActive().id;
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
