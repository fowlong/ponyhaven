// Luanti's existing media protocol fetches the local scenery ring from this
// machine. Models stay compressed on disk; unused parts never enter the client.
import http from 'node:http';
import {createReadStream} from 'node:fs';
import {createInflate} from 'node:zlib';
import {pipeline} from 'node:stream';
const servers=new Map();

export async function openSceneryMedia(build,entries){
 const port=20000+parseInt(build.slice(0,8),16)%20000;
 let state=servers.get(port);
 if(state){if(state.build!==build)return null;state.references++;return lease(state);}
 const index=Buffer.alloc(6+entries.size*20);index.writeUInt32BE(0x4d544853,0);index.writeUInt16BE(1,4);
 let at=6;for(const hash of entries.keys()){Buffer.from(hash,'hex').copy(index,at);at+=20;}
 state={build,port,references:1,requests:0,bytes:0};
 state.server=http.createServer((request,response)=>{
  if(request.method!=='GET'){response.writeHead(405);response.end();return;}
  if(request.url==='/build'){response.end(build);return;}
  if(request.url==='/index.mth'){response.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':index.length});response.end(index);return;}
  const hash=request.url?.slice(1),entry=/^[a-f0-9]{40}$/.test(hash||'')?entries.get(hash):null;
  if(!entry){response.writeHead(404);response.end();return;}
  state.requests++;state.bytes+=entry.bytes;
  response.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':entry.bytes,'Cache-Control':'public, max-age=31536000, immutable'});
  const input=createReadStream(entry.source);
  if(entry.compressed)pipeline(input,createInflate(),response,()=>{});else pipeline(input,response,()=>{});
 });
 try{await new Promise((resolve,reject)=>{state.server.once('error',reject);state.server.listen(port,'127.0.0.1',resolve);});}
 catch(error){
  if(error.code!=='EADDRINUSE')throw error;
  // Another Ponyhaven process can share the same immutable build. Never
  // replace an unrelated listener or expose filesystem paths through HTTP.
  const matches=await new Promise(resolve=>{
   const request=http.get(`http://127.0.0.1:${port}/build`,{timeout:1000},response=>{let body='';response.on('data',b=>{body+=b;if(body.length>128)request.destroy();});response.on('end',()=>resolve(body===build));});
   request.on('error',()=>resolve(false));request.on('timeout',()=>{request.destroy();resolve(false);});
  });
  return matches?{port,close:async()=>{},stats:()=>({shared:true})}:null;
 }
 servers.set(port,state);return lease(state);
}
function lease(state){
 let closed=false;
 return {port:state.port,stats:()=>({requests:state.requests,bytes:state.bytes}),close:async()=>{
  if(closed)return;closed=true;if(--state.references)return;servers.delete(state.port);
  await new Promise(resolve=>state.server.close(resolve));
 }};
}
