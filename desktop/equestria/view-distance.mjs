// Read only the native protocol's name/view-range metadata. All packets pass
// unchanged; gameplay, authentication and reliability stay with Luanti.
import dgram from 'node:dgram';
export function viewMetadata(packet){
 if(packet.length<10||packet.readUInt32BE(0)!==0x4f457403)return null;
 let at=7;for(let n=0;n<3&&packet[at]===3;n++)at+=3;
 if(packet[at]!==1||packet.length<at+3)return null;at++;
 const command=packet.readUInt16BE(at);
 if(command===2&&packet.length>=at+11){
  const length=packet.readUInt16BE(at+9);if(length!==19||packet.length<at+11+length)return null;
  const name=packet.toString('ascii',at+11,at+11+length);return /^ph_[a-f0-9]{16}$/.test(name)?{name}:null;
 }
 if(command===0x23&&packet.length>=at+40){const range=packet[at+39]*16;return range>=16?{range}:null;}
 return null;
}
export async function openViewDistanceBridge(target,onRange){
 const front=dgram.createSocket('udp4'),clients=new Map();let closed=false;
 front.on('message',(packet,from)=>{
  if(closed||from.address!=='127.0.0.1'||packet.length>8192||packet.length<8||packet.readUInt32BE(0)!==0x4f457403)return;
  let c=clients.get(from.port);
  if(!c){
   if(clients.size>=32)return;
   const socket=dgram.createSocket('udp4');c={socket,last:Date.now(),name:'',range:0};clients.set(from.port,c);
   socket.on('message',(data,source)=>{if(!closed&&source.address==='127.0.0.1'&&source.port===target)front.send(data,from.port,'127.0.0.1');});
   socket.on('error',()=>{clients.delete(from.port);try{socket.close();}catch{}});
  }
  c.last=Date.now();const info=viewMetadata(packet);
  if(info?.name)c.name=info.name;
  if(info?.range&&info.range!==c.range){c.range=info.range;if(c.name)onRange(c.name,c.range);}
  c.socket.send(packet,target,'127.0.0.1');
 });
 await new Promise((resolve,reject)=>{front.once('error',reject);front.bind(0,'127.0.0.1',resolve);});
 const timer=setInterval(()=>{for(const [port,c]of clients)if(Date.now()-c.last>120000){clients.delete(port);c.socket.close();}},30000);timer.unref();
 return {port:front.address().port,stats:()=>[...clients.values()].map(({name,range})=>({name,range})),close:()=>{
  if(closed)return;closed=true;clearInterval(timer);for(const c of clients.values())c.socket.close();clients.clear();front.close();
 }};
}
