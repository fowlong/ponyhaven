// Inspect composited GIF frames, including sparse miniaturising frames hidden by
// a normal-sized transparent canvas. Original artwork is left intact.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';
const ponies=JSON.parse(await fs.readFile('public/data/ponies.json','utf8'));
const assets=[...new Set(ponies.flatMap(p=>p.behaviors.flatMap(b=>[b.left,b.right])))];
const server=http.createServer(async(req,res)=>{
 if(req.url==='/'){res.end('<!doctype html><title>Pet frame audit</title>');return;}
 const i=Number(req.url.slice(1));if(!Number.isInteger(i)||!assets[i]){res.writeHead(404);res.end();return;}
 try{res.end(await fs.readFile(path.join('public',decodeURIComponent(assets[i]))));}catch{res.writeHead(404);res.end();}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage();page.on('console',m=>console.log(m.text()));await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const metrics=await page.evaluate(async(count)=>{
  const result=[];const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
  for(let i=0;i<count;i++){
   const data=await(await fetch('/'+i)).arrayBuffer(),decoder=new ImageDecoder({data,type:'image/gif',preferAnimation:true});await decoder.tracks.ready;
   const frames=[];let canvas,ctx;
   for(let f=0;f<decoder.tracks.selectedTrack.frameCount;f++){
    const {image}=await decoder.decode({frameIndex:f});if(!canvas){canvas=new OffscreenCanvas(image.displayWidth,image.displayHeight);ctx=canvas.getContext('2d',{willReadFrequently:true});}
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);image.close();
    const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;let area=0,x0=canvas.width,y0=canvas.height,x1=-1,y1=-1;
    for(let n=3;n<rgba.length;n+=4)if(rgba[n]>100){area++;const at=(n-3)/4,x=at%canvas.width,y=Math.floor(at/canvas.width);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    frames.push({area,w:area?x1-x0+1:0,h:area?y1-y0+1:0});
   }
   decoder.close();const areas=frames.map(f=>f.area);result.push({frames:frames.length,min:Math.min(...areas),median:median(areas),max:Math.max(...areas),minFrame:areas.indexOf(Math.min(...areas)),width:median(frames.map(f=>f.w)),height:median(frames.map(f=>f.h))});
   if((i+1)%250===0)console.log(`Audited ${i+1}/${count} GIFs`);
  }return result;
 },assets.length);
 const byAsset=Object.fromEntries(assets.map((a,i)=>[a,metrics[i]]));await fs.mkdir('tmp/qa',{recursive:true});await fs.writeFile('tmp/qa/pet-frame-metrics.json',JSON.stringify(byAsset));
 const flagged=[];
 for(const p of ponies){const idle=p.behaviors.find(b=>b.name===p.idle)||p.behaviors[0],base=byAsset[idle.right].median;
  for(const b of p.behaviors){if(b===idle)continue;const r=byAsset[b.right],l=byAsset[b.left];if(Math.min(r.min,l.min)<base*.30)flagged.push({pony:p.id,name:b.name,ratio:Math.min(r.min,l.min)/base,median:Math.min(r.median,l.median)/base,right:b.right,frame:r.minFrame});}
 }
 await fs.writeFile('tmp/qa/pet-frame-flags.json',JSON.stringify(flagged,null,2));console.log('Audit complete:',assets.length,'GIFs;',metrics.reduce((n,m)=>n+m.frames,0),'frames;',flagged.length,'suspect behaviours.');console.log(flagged.map(f=>`${f.pony}: ${f.name} (${f.ratio.toFixed(2)})`).join('\n'));
}finally{await browser.close();await new Promise(r=>server.close(r));}
