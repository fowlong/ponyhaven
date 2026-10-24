// Actual shipped GLSL + source-map geometry. Headless diagnostic, not gameplay capture.
import fs from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import http from 'node:http';
import {chromium} from 'playwright';
import {materialDefinition} from '../desktop/equestria/materials.mjs';
import {regionColumns,columnMesh,sceneryOBJ} from '../desktop/equestria/scenery-columns.mjs';
const mod='native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven';
const vertex=await fs.readFile(mod+'/shaders/object_shader/opengl_vertex.glsl','utf8'),fragment=await fs.readFile(mod+'/shaders/object_shader/opengl_fragment.glsl','utf8');
const h=JSON.parse(await fs.readFile(mod+'/horizon.json','utf8')),resources=new Map([['/atlas',await fs.readFile(mod+'/textures/eq_horizon.png')]]);
function parseOBJ(text){
 const positions=[],coords=[],vertices=[],indices=[],used=new Map();
 for(const line of text.split('\n')){
  const [kind,...p]=line.split(' ');
  if(kind==='v')positions.push([-Number(p[0]),Number(p[1]),Number(p[2])]);
  if(kind==='vt')coords.push([Number(p[0]),1-Number(p[1])]);
  if(kind==='f'){
   const c=p.map(key=>{let n=used.get(key);if(n!==undefined)return n;const [v,t]=key.split('/').map(n=>Number(n)-1);n=vertices.length/5;vertices.push(...positions[v],...coords[t]);used.set(key,n);return n;});
   // Irrlicht reflects X and triangulates OBJ polygons with reversed winding.
   for(let i=1;i<c.length-1;i++)indices.push(c[i+1],c[i],c[0]);
  }
 }
 return {vertices,indices};
}
function binary({vertices,indices}){
 const v=Float32Array.from(vertices),i=Uint32Array.from(indices),head=Buffer.alloc(8);head.writeUInt32LE(v.length);head.writeUInt32LE(i.length,4);
 return Buffer.concat([head,Buffer.from(v.buffer),Buffer.from(i.buffer)]);
}
const states=JSON.parse(await fs.readFile('native/equestria/world/states.json','utf8')),palette=new Map();
const colours=Uint16Array.from(states.map((s,id)=>{const m=materialDefinition(s,id);if(m.shape==='air'||m.shape==='plant'||(!m.solid&&m.shape!=='liquid'))return 0;const key=m.colour.join(',');if(!palette.has(key))palette.set(key,palette.size+1);return palette.get(key);}));
for(const [label,rx,rz]of [['ponyville',0,-1],['canterlot',1,-2]]){
 const grid=regionColumns(await fs.readFile(`native/equestria/world/regions/r.${rx}.${rz}.eqr`),colours,1);
 resources.set('/'+label+'-source',binary(parseOBJ(sceneryOBJ(columnMesh(grid),{rx,rz,minY:grid.minY,step:1,textureWidth:h.textureWidth,textureHeight:h.textureHeight}))));
 for(const mode of ['ring','low']){
  const joined={vertices:[],indices:[]};
  for(const tile of h.tiles.filter(t=>t.id.startsWith(`${rx},${rz},`))){
   const model=mode==='low'?tile.low:tile;
   const mesh=parseOBJ(inflateSync(await fs.readFile(mod+'/scenery/'+model.mesh+'.deflate')).toString()),offset=joined.vertices.length/5;
   for(const v of mesh.vertices)joined.vertices.push(v);for(const i of mesh.indices)joined.indices.push(i+offset);
  }
  resources.set('/'+label+'-'+mode,binary(joined));
 }
}
const server=http.createServer((req,res)=>{const data=req.url==='/'?'<!doctype html><title>Scenery QA</title>':resources.get(req.url);res.writeHead(data?200:404);res.end(data);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',timeout:60000});
try{
 const page=await browser.newPage({viewport:{width:1280,height:820}});await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.setContent('<style>body{margin:0;background:#adc4db;color:#182135;font:14px sans-serif}canvas{display:block}p{margin:8px}</style><p>Source voxels (left) / cheaper outer scenery tier (right). Same camera, coordinates and fog. Headless shader diagnostic.</p><canvas width="1280" height="760"></canvas>');
 const result=await page.evaluate(async({vertex,fragment})=>{
  const gl=document.querySelector('canvas').getContext('webgl2',{preserveDrawingBuffer:true,antialias:false});if(!gl)throw Error('No WebGL2');
  const prefix='#version 300 es\nprecision highp float;\n#define CENTROID_ centroid\n#define TILE_MATERIAL_PLAIN 1\n#define MATERIAL_TYPE 1\n';
  const vs=prefix+'#define VARYING_ out\nin vec4 inVertexPosition;in vec3 inVertexNormal;in vec4 inVertexColor;in vec2 inTexCoord0;uniform mat4 mTexture;uniform mat4 mWorldView;uniform mat4 mWorldViewProj;\n'+vertex;
  const fs=prefix+'#define VARYING_ in\n#define texture2D texture\nout vec4 resultColour;\n#define gl_FragColor resultColour\n'+fragment;
  const compile=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vs));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fs));gl.transformFeedbackVaryings(program,['worldPosition','eyeVec'],gl.INTERLEAVED_ATTRIBS);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
  const U=n=>gl.getUniformLocation(program,n),I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],M=(n,m)=>gl.uniformMatrix4fv(U(n),false,m);
  const sub=(a,b)=>a.map((v,i)=>v-b[i]),unit=v=>v.map(n=>n/Math.hypot(...v)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
  const look=(eye,target)=>{const z=unit(sub(eye,target)),x=unit(cross([0,1,0],z)),y=cross(z,x);return[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];};
  const mul=(a,b)=>Array.from({length:16},(_,i)=>[0,1,2,3].reduce((s,k)=>s+a[(i%4)+k*4]*b[Math.floor(i/4)*4+k],0));
  const transform=(m,p)=>[0,1,2].map(i=>m[i]*p[0]+m[i+4]*p[1]+m[i+8]*p[2]+m[i+12]);
  const translate=v=>{const m=[...I];m.splice(12,3,...v);return m;};
  const f=1/Math.tan(72*Math.PI/360),P=[f/(640/380),0,0,0,0,f,0,0,0,0,-20001/19999,-1,0,0,-40000/19999,0];
  const buffers=[],attr=(name,data,size)=>{const a=gl.getAttribLocation(program,name),b=gl.createBuffer();buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,0,0);};
  M('mWorld',I);M('mTexture',I);M('mWorldView',I);M('mWorldViewProj',P);gl.uniform3f(U('cameraOffset'),0,0,0);gl.uniform3f(U('dayLight'),1,1,1);gl.uniform4f(U('materialColor'),1,1,1,1);gl.uniform4f(U('fogColor'),.68,.77,.86,1);gl.uniform1f(U('fogShadingParameter'),20);gl.uniform1i(U('baseTexture'),0);
  gl.vertexAttrib4f(gl.getAttribLocation(program,'inVertexColor'),1,1,1,1);const normal=gl.getAttribLocation(program,'inVertexNormal');
  const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const colour=c=>gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(c));gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.viewport(0,0,640,380);
  const clear=()=>{gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);},pixel=()=>{const p=new Uint8Array(4);gl.readPixels(320,190,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p];};
  const quad=(d,ring=true)=>{attr('inVertexPosition',[-d,-d,-d,d,-d,-d,0,d,-d],3);attr('inTexCoord0',[.5,.5,.5,.5,.5,.5],2);gl.vertexAttrib3f(normal,0,ring?3:1,0);gl.drawArrays(gl.TRIANGLES,0,3);};
  colour([230,80,40,255]);for(const range of [1280,2560,5120,10240]){
   gl.uniform1f(U('fogDistance'),range);
   for(const d of [64,range*.6,range-50,...(range<10240?[range+50]:[])]){clear();quad(d);if(pixel()[0]<100)throw Error('Unloaded band at range '+range+', distance '+d);}
   clear();quad(Math.min(range+Math.max(1280,Math.min(2560,range*.5)),10240)+100);if(pixel()[0]!==0)throw Error('Unbounded scenery');
  }
  gl.uniform1f(U('fogDistance'),5120);clear();quad(30);if(pixel()[0]!==0)throw Error('Scenery covers close craters');
  clear();quad(4000);colour([30,240,60,255]);quad(4500,false);if(pixel()[1]<180)throw Error('Loaded voxels lost priority over approximate scenery');
  clear();colour([230,80,40,255]);quad(4000);colour([30,240,60,255]);quad(4000,false);if(pixel()[1]<180)throw Error('Detailed face lost depth priority');
  clear();quad(4000,false);colour([230,80,40,255]);quad(4000);if(pixel()[1]<180)throw Error('Depth depends on draw order');
  clear();colour([230,80,40,255]);quad(4000);colour([30,240,60,255]);quad(4500);if(pixel()[0]<180||pixel()[1]>120)throw Error('Scenery faces have incorrect depth ordering');
  clear();quad(4500);colour([230,80,40,255]);quad(4000);if(pixel()[0]<180||pixel()[1]>120)throw Error('Scenery depth depends on draw order');
  const samples=[];for(const d of [5120,5500,6200,7000,7670]){clear();quad(d);samples.push(pixel());}const fog=[173,196,219],err=p=>Math.hypot(...p.slice(0,3).map((v,i)=>v-fog[i]));for(let i=1;i<samples.length;i++)if(err(samples[i])>err(samples[i-1])+2)throw Error('Fog transition is discontinuous');if(err(samples.at(-1))>3)throw Error('Ring edge not fogged out');
  const tf=gl.createBuffer();gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER,tf);gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER,24,gl.DYNAMIC_READ);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,tf);
  const point=[6160,635,8440];let maxDrift=0;
  // Walking, orbit, altitude, and a rebased camera with stale object translation.
  for(const eye of [[6000,680,4400],[6024,680,4400],[4500,680,7000],[6000,2200,4400],[-3320,2520,17030]])for(const offset of [[0,0,0],[6000,0,4000]])for(const old of [[0,0,0],offset,[-6000,-2500,-17000]]){
   const view=look(sub(eye,offset),sub(point,offset)),world=translate(old.map(n=>-n)),wv=mul(view,world);M('mWorld',world);M('mWorldView',wv);M('mWorldViewProj',mul(P,wv));gl.uniform3fv(U('cameraOffset'),offset);gl.vertexAttrib3f(normal,0,3,0);attr('inVertexPosition',point,3);
   gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,1);gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);const values=new Float32Array(6);gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER,0,values);
   const expected=[...sub(point,offset),...transform(view,sub(point,offset)).map(n=>-n)];values.forEach((v,i)=>maxDrift=Math.max(maxDrift,Math.abs(v-expected[i])));
  }
  if(maxDrift>.02)throw Error('Camera/entity drift: '+maxDrift);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.deleteBuffer(tf);for(const b of buffers)gl.deleteBuffer(b);
  const image=new Image();image.src='/atlas';await image.decode();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
  const meshes={};for(const label of ['ponyville','canterlot'])for(const mode of ['source','ring','low']){
   const data=await(await fetch('/'+label+'-'+mode)).arrayBuffer(),h=new Uint32Array(data,0,2),v=new Float32Array(data,8,h[0]),i=new Uint32Array(data,8+h[0]*4,h[1]),vao=gl.createVertexArray();gl.bindVertexArray(vao);const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,v,gl.STATIC_DRAW);
   for(const [name,size,offset]of [['inVertexPosition',3,0],['inTexCoord0',2,12]]){const a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,20,offset);}
   const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,i,gl.STATIC_DRAW);meshes[label+'-'+mode]={vao,count:i.length};
  }
  gl.uniform3f(U('cameraOffset'),0,0,0);M('mWorld',I);gl.vertexAttrib3f(normal,0,3,0);gl.uniform1f(U('fogDistance'),5120);gl.enable(gl.CULL_FACE);gl.frontFace(gl.CCW);gl.clearColor(.68,.77,.86,1);
  window.drawComparison=(flight=false)=>{gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   for(const [label,row,eye,target]of [['ponyville',1,[2560,flight?2000:180,-1800],[1500,180,2000]],['canterlot',0,[7000,flight?2800:900,3000],[7000,1100,8000]]]){
    const view=look(eye,target);M('mWorldView',view);M('mWorldViewProj',mul(P,view));
    for(const [mode,col]of [['source',0],['low',1]]){gl.viewport(col*640,row*380,640,380);const mesh=meshes[label+'-'+mode];gl.bindVertexArray(mesh.vao);gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_INT,0);}
   }
   gl.finish();if(gl.getError()!==gl.NO_ERROR)throw Error('GPU draw failed');
  };window.drawComparison();return {originDriftInNodes:maxDrift/10,fogSamples:samples,triangles:Object.fromEntries(Object.entries(meshes).map(([k,v])=>[k,v.count/3]))};
 },{vertex,fragment});
 await fs.mkdir('tmp/qa',{recursive:true});await page.screenshot({path:'tmp/qa/equestria-ring-ground.png'});await page.evaluate(()=>window.drawComparison(true));await page.screenshot({path:'tmp/qa/equestria-ring-flight.png'});console.log('Scenery shader/geometry checks passed:',JSON.stringify(result));
}finally{await browser.close();await new Promise(r=>server.close(r));}
