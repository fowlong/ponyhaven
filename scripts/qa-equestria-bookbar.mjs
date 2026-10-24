// Layout preview from HUD definitions exported by the real Luanti combat test.
// This verifies placement/assets; it is not a native gameplay screenshot.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const file=process.argv[2];assert.ok(file,'Pass the combat test bookbar-hud.json path.');
const hud=JSON.parse(await fs.readFile(file,'utf8')),textures='native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven/textures';
assert.equal(hud.filter(h=>h.text==='EQUIPPED').length,1);
const images={};
for(const h of hud.filter(h=>h.type==='image')){
 const name=h.text.split('^')[0];if(images[name])continue;
 const data=await fs.readFile(path.join(textures,name));images[name]={src:'data:image/png;base64,'+data.toString('base64'),w:data.readUInt32BE(16),h:data.readUInt32BE(20)};
}
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',timeout:60000});
try{
 const page=await browser.newPage();await fs.mkdir('tmp/qa',{recursive:true});
 for(const width of [800,640]){
  await page.setViewportSize({width,height:250});
  await page.setContent('<style>body{margin:0;background:#292d42;color:#d2d8e9;font:16px sans-serif} .hud{position:absolute;transform:translate(-50%,-50%);white-space:pre;text-shadow:0 1px 2px #000}img{image-rendering:pixelated} footer{position:absolute;bottom:16px;text-align:center;width:100%;font-size:12px}</style><footer>Spellbook HUD layout · generated from real engine HUD definitions</footer>');
  await page.evaluate(({hud,images})=>{
   for(const h of hud){
    const el=document.createElement(h.type==='image'?'img':'span');el.className='hud';el.dataset.hud=h.text;
    el.style.left=(h.position.x*innerWidth+h.offset.x)+'px';el.style.top=(h.position.y*innerHeight+h.offset.y)+'px';el.style.zIndex=h.z_index;
    if(h.type==='image'){
     const img=images[h.text.split('^')[0]];el.src=img.src;el.style.width=img.w*h.scale.x+'px';el.style.height=img.h*h.scale.y+'px';
     const opacity=/\^\[opacity:(\d+)/.exec(h.text);if(opacity)el.style.opacity=Number(opacity[1])/255;
    }else{el.textContent=h.text;el.style.color='#'+h.number.toString(16).padStart(6,'0');el.style.fontSize=16*h.size.x+'px';}
    document.body.appendChild(el);
   }
  },{hud,images});
  await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
  for(const bounds of await page.locator('.hud').evaluateAll(els=>els.map(el=>{const b=el.getBoundingClientRect();return{x:b.x,right:b.right,y:b.y,bottom:b.bottom};}))){assert.ok(bounds.x>=0&&bounds.right<=width&&bounds.y>=0&&bounds.bottom<=250,'Book bar exceeds viewport');}
  await page.screenshot({path:`tmp/qa/equestria-bookbar-${width}.png`});
 }
 console.log('Spellbook bar assets and bounds passed at 800px and 640px; previews are in tmp/qa.');
}finally{await browser.close();}
