import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('ponyhaven:save:guest')).save);
const settle = () =>
  page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map(async (i) => {
        i.loading = 'eager';
        try {
          await i.decode();
        } catch {}
      }),
    );
  });
try {
  await fs.mkdir('tmp/qa', { recursive: true });
  await page.goto(process.env.QA_URL || 'http://127.0.0.1:5173/');
  await page.locator('[data-starter="rarity"]').click();
  await page.locator('[data-action="begin"]').click();
  await settle();
  await page.locator('[data-care="play"]').click();
  let s = await state();
  assert.equal(s.dirt, 0.25);
  assert.ok(s.stats.food < 85 && s.stats.energy < 90);
  assert.ok(s.xp >= 6);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'tmp/qa/10-dirty-play.png' });
  await page.locator('[data-action="bath"]').click();
  await page.waitForTimeout(250);
  const rect = await page.locator('#pet-sprite').boundingBox();
  // Find a solid pixel on the rendered GIF; transparent bounding-box pixels do not wash.
  const point = await page.locator('#pet-sprite').evaluate((img) => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, 64, 64);
    const data = x.getImageData(0, 0, 64, 64).data;
    for (let y = 25; y < 55; y++)
      for (let px = 15; px < 50; px++)
        if (data[(y * 64 + px) * 4 + 3] > 200) return { x: px / 64, y: y / 64 };
    throw new Error('No solid pony pixel');
  });
  await page.mouse.move(rect.x + point.x * rect.width, rect.y + point.y * rect.height);
  await page.mouse.down();
  await page.waitForTimeout(950);
  await page.screenshot({ path: 'tmp/qa/11-bath.png' });
  await page.mouse.up();
  s = await state();
  assert.ok(s.dirt < 0.25);
  assert.ok(s.stats.wellbeing > 79);
  await page.locator('[data-action="bath"]').click();
  await page.waitForTimeout(1800);
  await page.locator('[data-care="brush"]').click();
  assert.equal((await state()).dirt, 0);
  await page.waitForTimeout(2600);
  await page.locator('[data-care="rest"]').click();
  assert.match(await page.locator('#pet-sprite').getAttribute('src'), /sleep/);
  await page.screenshot({ path: 'tmp/qa/12-sleep.png' });
  await page.waitForTimeout(2600);
  await page.locator('[data-care="transform"]').click();
  await page.locator('.transformed').waitFor();
  const transformed = await page.locator('#meadow-scene').getAttribute('data-behavior');
  assert.match(transformed, /cryst|breez|galla|dress|farm|outfit|costume|fashion/i);
  await page.screenshot({ path: 'tmp/qa/13-transformation.png' });
  await page.waitForTimeout(10400);
  assert.equal(await page.locator('.transformed').count(), 0);
  assert.equal(await page.locator('.event-cameo').count(), 0);
  const before = await state();
  await page.locator('[data-action="invite-npc"]').click();
  await page.locator('.friend-pony').waitFor();
  await page.waitForTimeout(300);
  s = await state();
  assert.ok(s.npc);
  assert.ok(s.stats.bond > before.stats.bond);
  assert.ok(s.xp > before.xp);
  assert.equal(await page.locator('[data-action="invite-npc"]').isDisabled(), true);
  await page.reload();
  await page.locator('.friend-pony').waitFor();
  assert.equal((await state()).npc.ponyId, s.npc.ponyId);
  const old = await page.locator('#meadow-scene').evaluate((el) => el.style.backgroundImage);
  await page.locator('[data-action="next-background"]').click();
  assert.notEqual(await page.locator('#meadow-scene').evaluate((el) => el.style.backgroundImage), old);
  await page.reload();
  await page.locator('#meadow-scene').waitFor();
  assert.notEqual(await page.locator('#meadow-scene').evaluate((el) => el.style.backgroundImage), old);
  await settle();
  await page.screenshot({ path: 'tmp/qa/14-background-npc.png' });
  // Import is the supported path for deterministic progression/rarity fixtures, without altering the user's save.
  const cards = JSON.parse(await fs.readFile('public/data/cards.json', 'utf8'));
  s = await state();
  s.xp = 99;
  s.ponyProgress[s.pet.ponyId].xp = 99;
  s.careAt = 0;
  s.petUnlocks.push({ ponyId: 'twilight-sparkle', rarity: 'UR', tier: 4 });
  await page.locator('[data-action="settings"]').click();
  await page.locator('#import-save').setInputFiles({
    name: 'qa-save.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(s)),
  });
  await page.locator('#modal').waitFor({ state: 'hidden' });
  await page.locator('[data-care="pet"]').click();
  await page.locator('.reward-nudge').waitFor();
  s = await state();
  assert.equal(s.levelRewards.length, 1);
  assert.ok(cards.find((c) => c.id === s.levelRewards[0].cardId).tier >= 4);
  await page.locator('[data-action="rewards"]').click();
  await settle();
  await page.screenshot({ path: 'tmp/qa/15-level-reward.png' });
  await page.locator('[data-action="claim-reward"]').click();
  await page.locator('[data-action="pets"]').first().click();
  await page.locator('[data-pet="twilight-sparkle"]').click();
  assert.equal((await state()).xp, 0);
  await page.locator('[data-action="pets"]').first().click();
  await page.locator('[data-pet="rarity"][data-pet-rarity="SR"]').click();
  assert.ok((await state()).xp >= 100);
  await page.locator('nav [data-nav="collection"]').click();
  await page.locator('[data-collection-mode="all"]').click();
  await page.locator('#rarity-filter').selectOption('*AR');
  await settle();
  await page.screenshot({ path: 'tmp/qa/16-rarity-binder.png' });
  const foil = page.locator('.collection-grid .foil').first();
  assert.ok((await foil.evaluate((el) => Number(getComputedStyle(el).opacity))) >= 0.4);
  await page.locator('.collection-grid [data-card]').first().click();
  await settle();
  await page.screenshot({ path: 'tmp/qa/17-rarity-detail.png' });
  await page.locator('[data-action="close"]').click();
  await page.locator('nav [data-nav="blocks"]').click();
  await page.locator('[data-action="start-game"]').click();
  const xpBefore = (await state()).xp;
  await page.keyboard.press('Space');
  assert.ok((await state()).xp > xpBefore);
  await page.locator('[data-action="pause"]').click();
  for (const [width, height] of [
    [390, 844],
    [320, 740],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    const fit = await page.locator('.touch-controls').evaluate((el) => {
      const r = el.getBoundingClientRect(),
        nav = document.querySelector('nav');
      return {
        bottom: r.bottom,
        viewport: innerHeight,
        nav: getComputedStyle(nav).position === 'fixed' ? nav.getBoundingClientRect().top : innerHeight,
      };
    });
    assert.ok(fit.bottom <= fit.nav + 1, JSON.stringify({ width, height, ...fit }));
    await page.screenshot({ path: `tmp/qa/18-blocks-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('nav [data-nav="home"]').click();
  await page.locator('[data-action="settings"]').click();
  await page.locator('#motion-setting').check();
  await page.locator('#sound-setting').uncheck();
  await page.locator('[data-action="close"]').click();
  assert.ok((await page.locator('#pet-sprite').getAttribute('src')).endsWith('.png'));
  assert.ok(
    await page
      .locator('.pony-sparkles i')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName === 'none'),
  );
  await page.locator('[data-action="settings"]').click();
  await page.locator('[data-action="reset-account"]').click();
  await page.locator('#reset-confirm').fill('RESET');
  await page.locator('[data-action="confirm-reset"]').click();
  await page.locator('.starter-grid').waitFor();
  const reset = await state();
  assert.equal(reset.coins, 0);
  assert.equal(reset.pet, null);
  assert.deepEqual(reset.collection, {});
  assert.deepEqual(reset.ponyProgress, {});
  assert.ok(await page.evaluate(() => !!localStorage.getItem('ponyhaven:save:guest:before-reset')));
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: true,
        checks:
          'dirt, collision bath, brushing, sleep, 10-second transformations, no cameos, NPC friendship/XP, persistence, backgrounds, per-pony level rewards/switching, tier effects, block XP, no-scroll mobile/landscape, sound/motion settings, reset backup',
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
