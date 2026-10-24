import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {openSceneryMedia} from '../desktop/equestria/scenery-media.mjs';

test('local media delivers verified decompressed assets, refuses paths and shares its lifetime',async()=>{
 const dir=await fs.mkdtemp(path.resolve('tmp/scenery-media-test-'));
 const data=Buffer.from('v 10 20 -30\n'.repeat(1000)),hash=createHash('sha1').update(data).digest('hex');
 const source=path.join(dir,'tile.obj.deflate');await fs.writeFile(source,deflateSync(data));
 const entries=new Map([[hash,{source,bytes:data.length,compressed:true}]]);
 const first=await openSceneryMedia('a913bbdf-media-test',entries),second=await openSceneryMedia('a913bbdf-media-test',entries);
 try{
  assert.ok(first&&second);assert.equal(first.port,second.port);const base=`http://127.0.0.1:${first.port}`;
  const response=await fetch(base+'/'+hash);assert.equal(response.status,200);assert.equal(+response.headers.get('content-length'),data.length);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),data);
  const index=Buffer.from(await(await fetch(base+'/index.mth')).arrayBuffer());assert.equal(index.readUInt32BE(0),0x4d544853);assert.equal(index.readUInt16BE(4),1);assert.equal(index.subarray(6).toString('hex'),hash);
  for(const url of ['/missing','/../../package.json','/%2e%2e%2fpackage.json'])assert.equal((await fetch(base+url)).status,404);
  assert.equal((await fetch(base+'/'+hash,{method:'POST'})).status,405);
  await first.close();assert.equal((await fetch(base+'/build')).status,200);assert.equal(second.stats().requests,1);
 }finally{await first?.close();await second?.close();await fs.unlink(source);await fs.rmdir(dir);}
});
