// Capture every selectable background with a real pet at desktop and phone sizes.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const edges = process.env.BACKGROUND_EDGES === 'true';
const folder = process.env.BACKGROUND_REVIEW || 'tmp/background-review-current';
const backgrounds = JSON.parse(await fs.readFile('public/data/backgrounds.json', 'utf8'));
const only = process.env.BACKGROUND_ONLY
  ? JSON.parse(await fs.readFile(process.env.BACKGROUND_ONLY, 'utf8'))
  : null;
await fs.mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const measurements = [];
try {
  for (const [device, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(process.env.QA_URL || 'http://127.0.0.1:5173/');
    await page.locator('[data-starter="rarity"]').click();
    await page.locator('[data-action="begin"]').click();
    await page.locator('#meadow-scene').waitFor();
    if (edges) {
      const save = await page.evaluate(() => JSON.parse(localStorage.getItem('ponyhaven:save:guest')).save);
      save.npc = { ponyId: 'rarity', invitedAt: Date.now(), expiresAt: Date.now() + 1200000 };
      await page.locator('[data-action="settings"]').click();
      await page.locator('#import-save').setInputFiles({
        name: 'floor-review.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(save)),
      });
      await page.locator('#modal').waitFor({ state: 'hidden' });
    }
    await page.addStyleTag({ content: '#pet-bubble, #toast { visibility: hidden !important }' });
    for (let i = 0; i < backgrounds.length; i++) {
      if (only && !only.includes(backgrounds[i].id)) {
        if (i < backgrounds.length - 1) await page.locator('[data-action="next-background"]').click();
        continue;
      }
      const scene = page.locator('#meadow-scene');
      await scene.evaluate(async (el) => {
        const image = new Image();
        image.src = getComputedStyle(el).backgroundImage.slice(5, -2);
        await image.decode();
        await document.fonts.ready;
        await el.querySelector('#pet-sprite').decode();
        const guest = el.querySelector('.friend-pony > img');
        if (guest) await guest.decode();
        await new Promise(requestAnimationFrame);
      });
      if (edges) {
        // Visual probes at both ends of the reviewed lane, using the actual pet and NPC rendering.
        const geometry = await scene.evaluate((el) => {
          el.querySelector('#pet-wrap').style.left = el.dataset.walkMin + '%';
          el.querySelector('.friend-pony').style.left = el.dataset.walkMax + '%';
          const stage = el.getBoundingClientRect();
          return [...el.querySelectorAll('#pet-sprite, .friend-pony > img')].map((img) => {
            const rect = img.getBoundingClientRect();
            return {
              floor: Number(el.dataset.floor),
              feet: rect.bottom - stage.top,
              height: rect.height,
              left: rect.left - stage.left,
              right: rect.right - stage.left,
              stageWidth: stage.width,
            };
          });
        });
        for (const g of geometry) {
          assert.ok(Math.abs(g.floor - g.feet) < 1, `${backgrounds[i].name}: feet missed floor`);
          assert.ok(g.left >= -1 && g.right <= g.stageWidth + 1, `${backgrounds[i].name}: clipped pony`);
        }
        assert.ok(Math.abs(geometry[0].height - geometry[1].height) < 1, 'Pet and NPC scale differs');
      }
      await scene.screenshot({ path: `${folder}/${String(i).padStart(3, '0')}-${device}.png` });
      measurements.push(
        await scene.evaluate(
          (el, data) => {
            const stage = el.getBoundingClientRect(),
              pet = el.querySelector('#pet-sprite').getBoundingClientRect();
            return {
              ...data,
              width: stage.width,
              height: stage.height,
              pet: { x: pet.x - stage.x, y: pet.y - stage.y, width: pet.width, height: pet.height },
              floor: el.dataset.floor,
              min: el.dataset.walkMin,
              max: el.dataset.walkMax,
            };
          },
          { index: i, device, id: backgrounds[i].id, name: backgrounds[i].name },
        ),
      );
      if (i < backgrounds.length - 1) await page.locator('[data-action="next-background"]').click();
    }
    console.log(`${device}: reviewed ${measurements.filter((m) => m.device === device).length} backgrounds`);
    await context.close();
  }
  await fs.writeFile(`${folder}/measurements.json`, JSON.stringify(measurements, null, 2));
} finally {
  await browser.close();
}
