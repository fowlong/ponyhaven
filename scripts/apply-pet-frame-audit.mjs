import fs from 'node:fs/promises';
const file='public/data/ponies.json',ponies=JSON.parse(await fs.readFile(file,'utf8'));
const metrics=JSON.parse(await fs.readFile('tmp/qa/pet-frame-metrics.json','utf8'));let count=0;
for(const p of ponies){
 const idle=p.behaviors.find(b=>b.name===p.idle)||p.behaviors[0],baseline=metrics[idle.right].median;
 for(const b of p.behaviors){
  if(!metrics[b.left]||!metrics[b.right])throw Error('Run the complete frame audit before changing the catalog.');
  delete b.scaleSafe;
  if(b!==idle&&Math.min(metrics[b.right].min,metrics[b.left].min)<baseline*.30){b.scaleSafe=false;count++;}
 }
}
await fs.writeFile(file,JSON.stringify(ponies));console.log('Protected',count,'miniaturising/empty animations; original GIFs preserved.');
