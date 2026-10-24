// Focused release regression in disposable desktop/companion browser profiles.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

await fs.mkdir('tmp/qa', {recursive:true});
process.env.VITE_REQUIRE_AUTH = 'false';
process.env.VITE_FIREBASE_API_KEY = '';
const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const appearances = [];
try {
  for (const companion of [false, true]) {
    process.env.VITE_COMPANION = String(companion);
    const server = await createServer({configFile:false, envFile:false,
      server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});
    await server.listen();
    const context = await browser.newContext({viewport:companion ? {width:390,height:844} : {width:1440,height:1000},
      reducedMotion:'reduce', isMobile:companion, hasTouch:companion});
    try {
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
      await page.locator('[data-starter="rarity"]').click();
      await page.locator('[data-action="begin"]').click();
      const fixture = await page.evaluate(async() => {
        const {awardXP,syncProgress,seeded} = await import('/src/game.ts');
        const catalog = {cards:await fetch('/data/cards.json').then(r=>r.json()),ponies:await fetch('/data/ponies.json').then(r=>r.json())};
        const saved = JSON.parse(localStorage.getItem('ponyhaven:save:guest'));
        const s = saved.save;
        s.xp = 99;
        syncProgress(s);
        const before = {...s.collection};
        awardXP(s,1,catalog,seeded('sealed-gift-ui'));
        localStorage.setItem('ponyhaven:save:guest', JSON.stringify({...saved,save:s}));
        return {before,cardId:s.levelRewards[0].cardId};
      });
      const state = () => page.evaluate(()=>JSON.parse(localStorage.getItem('ponyhaven:save:guest')).save);
      await page.reload();
      await page.locator('[data-action="rewards"]').waitFor();
      assert.deepEqual((await state()).collection, fixture.before, 'Sealed gift does not enter collection');
      await page.locator('nav [data-nav="collection"]').click();
      assert.equal((await state()).collection[fixture.cardId] || 0, fixture.before[fixture.cardId] || 0);
      await page.locator('nav [data-nav="home"]').click();
      await page.locator('[data-action="rewards"]').click();
      await page.locator('.single-reveal').waitFor();
      assert.equal((await state()).collection[fixture.cardId], (fixture.before[fixture.cardId] || 0) + 1);
      await page.reload();
      await page.locator('[data-action="rewards"]').click();
      assert.equal((await state()).collection[fixture.cardId], (fixture.before[fixture.cardId] || 0) + 1, 'Reopen cannot duplicate gift');
      await page.locator('[data-action="claim-reward"]').click();
      assert.equal((await state()).levelRewards.length, 0);
      for (const scene of ['meadow', 'imported']) {
        if (scene === 'imported') await page.locator('[data-action="next-background"]').click();
        await page.locator('.pixel-background[data-ready="true"]').waitFor({state:'attached'});
        const pixels = await page.locator('.pixel-background').evaluate(canvas => {
          const rect = canvas.getBoundingClientRect(), style = getComputedStyle(canvas);
          const data = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
          return {width:canvas.width,height:canvas.height,displayWidth:rect.width,displayHeight:rect.height,
            rendering:style.imageRendering, pointer:style.pointerEvents, nonempty:data.some(n=>n!==0)};
        });
        assert.equal(pixels.width,Math.ceil(pixels.displayWidth/3));
        assert.equal(pixels.height,Math.ceil(pixels.displayHeight/3));
        assert.equal(pixels.rendering,'pixelated');
        assert.equal(pixels.pointer,'none');
        assert.ok(pixels.nonempty);
      }
      await page.locator('#meadow-scene').screenshot({path:`tmp/qa/pixel-scenery-${companion?'companion':'desktop'}-023.png`});

      // Render all real shared finishes side by side, at actual sprite scale.
      await page.evaluate(async() => {
        const {ponyFinish,finishNames} = await import('/src/rarity.ts');
        const sprite = document.querySelector('#pet-sprite').getAttribute('src');
        const cards = await fetch('/data/cards.json').then(r=>r.json());
        document.querySelector('#app').innerHTML = `<div class="aura-audit"><h1>Pony rarity auras</h1><div class="aura-grid">${
          finishNames.map((name,tier)=>`<section><div class="meadow-scene" style="background-image:linear-gradient(#e8e5fb,#c4e7db);--floor:75%;--sprite-scale:1.25"><div class="pet-wrap rarity-${tier}" style="left:50%;--native-width:92px"><img src="${sprite}" alt="Rarity"/>${ponyFinish()}</div></div><b>${cards.find(c=>c.tier===tier)?.rarity || tier} · ${name}</b><div class="pet-preview rarity-${tier}"><img src="${sprite}" alt="Preview"/>${ponyFinish()}</div></section>`).join('')
        }</div></div>`;
        const style = document.createElement('style');
        style.textContent = '.aura-audit{padding:24px;background:#fffaf6}.aura-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}.aura-grid section{min-width:0;text-align:center;border:1px solid #e5dbea;border-radius:14px;overflow:hidden;background:#faf6ff}.aura-grid .meadow-scene{height:220px;min-height:0;border-radius:0}.aura-grid b{display:block;font-size:12px;margin:12px 3px}.aura-grid .pet-preview{width:120px;margin:25px auto 12px}.aura-grid .pony-sparkles i{animation:none;opacity:1}.aura-grid .pet-wrap{transform:translateX(-50%)}@media(max-width:620px){.aura-audit{padding:12px}.aura-grid{grid-template-columns:repeat(2,1fr);gap:10px}.aura-grid .meadow-scene{height:185px}.aura-grid .pet-preview{min-height:100px}}';
        document.head.append(style);
        await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));
      });
      const styles = await page.locator('.aura-grid .pet-wrap').evaluateAll(nodes => nodes.map(el => {
        const glow = getComputedStyle(el.querySelector('.pet-aura'));
        const halo = getComputedStyle(el.querySelector('.pony-sparkles'), '::before');
        return {color:glow.getPropertyValue('--pony-glow'), background:glow.backgroundImage,opacity:glow.opacity,display:glow.display,
          halo:halo.borderRadius,mask:halo.maskImage};
      }));
      appearances.push(styles);
      assert.equal(new Set(styles.map(s=>s.color)).size,8,'Each tier has its own saturated colour');
      assert.ok(styles.slice(0,2).every(s=>s.display==='none'),'Standard N/BASE and R pets have no aura');
      assert.ok(styles.slice(2).every(s=>s.display!=='none' && Number(s.opacity)>=0.7),'Special tiers keep their aura with reduced motion');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:`tmp/qa/auras-${companion?'companion':'desktop'}-023.png`,fullPage:true});
      assert.deepEqual(errors,[]);
      console.log(`${companion?'Companion':'Desktop'}: sealed/reloaded/opened gifts, duplicate prevention, standard pets without auras and special tier finishes passed.`);
    } finally { await context.close(); await server.close(); }
  }
  assert.deepEqual(appearances[0],appearances[1], 'Desktop and companion share identical tier effects');
  console.log('Desktop / companion aura colours and effects match exactly.');
} finally { await browser.close(); }
