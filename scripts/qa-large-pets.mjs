import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await page.goto(process.env.QA_URL || 'http://127.0.0.1:5173/');
  await page.locator('[data-starter="rarity"]').click();
  await page.locator('[data-action="begin"]').click();
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('ponyhaven:save:guest')).save);
  save.petUnlocks.push({ ponyId: 'steven-magnet', rarity: 'R', tier: 1 });
  save.npc = { ponyId: 'princess-celestia', invitedAt: Date.now(), expiresAt: Date.now() + 1200000 };
  await page.locator('[data-action="settings"]').click();
  await page
    .locator('#import-save')
    .setInputFiles({
      name: 'large-pets.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(save)),
    });
  await page.locator('#modal').waitFor({ state: 'hidden' });
  await page.locator('[data-action="pets"]').first().click();
  await page.locator('[data-pet="steven-magnet"]').click();
  for (const [width, height] of [
    [390, 844],
    [320, 740],
    [1440, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator('#meadow-scene').evaluate(async (scene) => {
      await Promise.all(
        [...scene.querySelectorAll('#pet-sprite, .friend-pony > img')].map((img) => img.decode()),
      );
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
    const result = await page.locator('#meadow-scene').evaluate((scene) => {
      scene.querySelector('#pet-wrap').style.left = scene.dataset.walkMin + '%';
      scene.querySelector('.friend-pony').style.left = scene.dataset.walkMax + '%';
      const stage = scene.getBoundingClientRect();
      return [...scene.querySelectorAll('#pet-sprite, .friend-pony > img')].map((img) => {
        const r = img.getBoundingClientRect();
        return {
          left: r.left - stage.left,
          right: r.right - stage.left,
          stageWidth: stage.width,
          feet: r.bottom - stage.top,
          floor: Number(scene.dataset.floor),
          ratio: r.width / r.height,
          natural: img.naturalWidth / img.naturalHeight,
        };
      });
    });
    for (const r of result) {
      assert.ok(r.left >= -1 && r.right <= r.stageWidth + 1, `Large sprite clipped at ${width}px`);
      assert.ok(Math.abs(r.feet - r.floor) < 1, 'Large sprite floats');
      assert.ok(Math.abs(r.ratio - r.natural) < 0.01, 'Large sprite stretched');
    }
    await page.locator('#meadow-scene').screenshot({ path: `tmp/qa/large-pets-${width}.png` });
  }
  console.log(
    'Large pets passed: Celestia visitor and Steven Magnet, edge clearance, floor contact and source aspect ratio at 320px, 390px and desktop.',
  );
} finally {
  await browser.close();
}
