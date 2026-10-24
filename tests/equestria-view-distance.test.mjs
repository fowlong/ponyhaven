import test from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import {viewMetadata,openViewDistanceBridge} from '../desktop/equestria/view-distance.mjs';
function packet(command,payload,reliable=false){const h=Buffer.alloc(reliable?11:8);h.writeUInt32BE(0x4f457403);h[7]=reliable?3:1;if(reliable)h[10]=1;const c=Buffer.alloc(2);c.writeUInt16BE(command);return Buffer.concat([h,c,payload]);}
test('native view distance changes are observed without changing UDP packets',async()=>{
 const name='ph_0123456789abcdef',init=Buffer.alloc(9+name.length);init[0]=29;init.writeUInt16BE(name.length,7);init.write(name,9);
 const login=packet(2,init,true);assert.deepEqual(viewMetadata(login),{name});
 const move=Buffer.alloc(46);move[37]=32;assert.deepEqual(viewMetadata(packet(0x23,move)),{range:512});
 move[37]=8;const reduced=packet(0x23,move);assert.deepEqual(viewMetadata(reduced),{range:128});assert.equal(viewMetadata(Buffer.alloc(70)),null);
 const engine=dgram.createSocket('udp4'),client=dgram.createSocket('udp4'),changes=[];
 await new Promise(r=>engine.bind(0,'127.0.0.1',r));engine.on('message',(data,from)=>engine.send(data,from.port,'127.0.0.1'));
 const bridge=await openViewDistanceBridge(engine.address().port,(...v)=>changes.push(v));
 try{for(const bytes of [login,reduced]){const echo=new Promise(r=>client.once('message',r));client.send(bytes,bridge.port,'127.0.0.1');assert.deepEqual(await echo,bytes);}assert.deepEqual(changes,[[name,128]]);}
 finally{bridge.close();client.close();engine.close();}
});
