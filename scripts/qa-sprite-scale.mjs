import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

process.env.VITE_REQUIRE_AUTH = 'false';
process.env.VITE_FIREBASE_API_KEY = '';
process.env.VITE_COMPANION = 'false';
const server = await createServer({ configFile: false, envFile: false, server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
await fs.mkdir('tmp/qa', { recursive: true });
try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    await page.locator('[data-starter="rarity"]').click();
    await page.locator('[data-action="begin"]').click();
    // Exercise the production Meadow renderer with deterministic animation selection.
    await page.evaluate(async () => {
      const { Meadow } = await import('/src/pet.ts');
      const ponies = await fetch('/data/ponies.json').then(r => r.json());
      const pony = ponies.find(p => p.id === 'rarity');
      const root = document.createElement('section');
      root.className = 'meadow-scene';
      root.style.cssText = 'width:calc(100vw - 32px);height:430px;min-height:0;position:relative;background:#d8ece1;margin:16px;overflow:hidden';
      root.innerHTML = '<button id="pet-wrap" class="pet-wrap rarity-0" style="left:50%"><img id="pet-sprite"/><span class="pet-name">Rarity</span></button><div id="friend-sprites"></div>';
      document.body.append(root);
      root.scrollIntoView();
      window.spriteAudit = { root, pony, meadow: new Meadow(root, pony, ponies, false) };
    });
    const frames = [];
    for (const pose of ['stand', 'Drama Couch', 'walk', 'fly1', 'Sleep 1', 'Galla_Dress', 'stand']) {
      const metrics = await page.evaluate(async (pose) => {
        const { root, pony, meadow } = window.spriteAudit;
        meadow.run(pony.behaviors.find(b => b.name === pose), 0, 60000);
        const img = root.querySelector('#pet-sprite');
        const expected=meadow.activeBehavior.name;
        const deadline=performance.now()+5000;
        while(root.dataset.behavior!==expected){if(performance.now()>deadline)throw Error('Sprite did not finish swapping');await new Promise(requestAnimationFrame);}
        await img.decode();
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        const rect = img.getBoundingClientRect(), scene = root.getBoundingClientRect();
        return { requested: pose, actual: root.dataset.behavior, scale: rect.width / img.naturalWidth,
          ratio: rect.width / rect.height, nativeRatio: img.naturalWidth / img.naturalHeight,
          left: rect.left - scene.left, right: rect.right - scene.left, width: scene.width,
          floor: Number(root.dataset.floor), feet: rect.bottom - scene.top };
      }, pose);
      frames.push(metrics);
      assert.ok(Math.abs(metrics.scale - frames[0].scale) < 0.002, `Sprite shrank: ${width}px ${JSON.stringify(metrics)}`);
      assert.ok(Math.abs(metrics.ratio - metrics.nativeRatio) < 0.01, `Stretched: ${pose}`);
      assert.ok(Math.abs(metrics.feet - metrics.floor) < 1, `Floating: ${pose}`);
      if (pose === 'Drama Couch') {
        assert.equal(metrics.actual, width === 1440 ? 'Drama Couch' : 'stand');
        await page.locator('section.meadow-scene').last().screenshot({ path: `tmp/qa/rarity-scale-${width}.png` });
      }
    }
    assert.deepEqual(errors, []);
    const guarded=await page.evaluate(async()=>{
      const {Meadow}=await import('/src/pet.ts'),{animationFits,ponyScale}=await import('/src/sprite-size.ts');
      const {root,meadow}=window.spriteAudit;meadow.destroy();const ponies=await fetch('/data/ponies.json').then(r=>r.json());
      const tested=[];
      for(const [id,pose]of [['twilight-sparkle','warp1'],['fluttershy','cuddles'],['silver-spoon','bump']]){
       const p=ponies.find(p=>p.id===id),b=p.behaviors.find(b=>b.name===pose);if(animationFits(p,b,1,1440,500))throw Error('Unsafe frame accepted: '+id);
       const actor=new Meadow(root,p,ponies,false);actor.run(b,0,60000);const deadline=performance.now()+5000;
       while(root.dataset.behavior!==p.idle){if(performance.now()>deadline)throw Error('Unsafe frame fallback failed');await new Promise(requestAnimationFrame);}
       await root.querySelector('img#pet-sprite').decode();tested.push(id);actor.destroy();
      }
      return tested;
    });
    console.log('Tiny-frame fallbacks:',guarded.join(', '));
    await page.evaluate(() => window.spriteAudit.meadow.destroy());
    await page.close();
    console.log(`Rarity pixel scale, poses, large scene fallback, and floor alignment passed at ${width}px.`);
  }
} finally {
  await browser.close();
  await server.close();
}
