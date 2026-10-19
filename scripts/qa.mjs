import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
await fs.mkdir('tmp/qa', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
const page = await context.newPage();
const errors = [];
const assetErrors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (response) => {
  if (response.status() >= 400) assetErrors.push(`${response.status()} ${response.url()}`);
});
const url = process.env.QA_URL || 'http://127.0.0.1:5173/';
const settle = async () => {
  await page.evaluate(async () => {
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
};
try {
  await page.goto(url);
  await page.locator('.starter-grid').waitFor();
  await page.locator('.starter img').first().waitFor();
  await settle();
  await page.screenshot({ path: 'tmp/qa/01-welcome.png', fullPage: true });
  await page.locator('[data-starter="twilight-sparkle"]').click();
  await page.locator('[data-action="begin"]').click();
  await page.locator('#meadow-scene').waitFor();
  await settle();
  await page.screenshot({ path: 'tmp/qa/02-meadow-desktop.png', fullPage: true });
  assert.equal(await page.locator('[data-wallet]').innerText(), '600');
  await page.locator('[data-care="feed"]').click();
  assert.match(await page.locator('[data-stat-label="food"]').innerText(), /100/);
  await page.locator('[data-action="gift"]').click();
  assert.equal(await page.locator('[data-wallet]').innerText(), '750');
  await page.reload();
  await page.locator('#meadow-scene').waitFor();
  assert.equal(await page.locator('[data-wallet]').innerText(), '750');
  assert.equal(await page.locator('[data-action="gift"]').isDisabled(), true);
  await page.locator('nav [data-nav="shop"]').click();
  await page.locator('[data-pack]').first().click();
  await page.locator('[data-action="rip"]').click();
  await page.locator('.reveal-card').waitFor();
  await settle();
  await page.screenshot({ path: 'tmp/qa/03-reveal.png' });
  await page.locator('[data-action="close"]').click();
  await page.reload();
  await page.locator('[data-action="resume-pack"]').click();
  await page.locator('[data-action="rip"]').click();
  await page.locator('[data-action="reveal-all"]').click();
  await page.locator('[data-action="finish-pack"]').click();
  await page.locator('nav [data-nav="shop"]').click();
  await page.locator('[data-buy-card]:not([disabled])').first().click();
  await page.screenshot({ path: 'tmp/qa/04-shop-desktop.png', fullPage: true });
  await page.locator('nav [data-nav="collection"]').click();
  await page.locator('[data-collection-mode="all"]').click();
  await page.locator('#card-search').fill('Fluttershy');
  assert.match(await page.locator('#results-label').innerText(), /treasures/);
  await page.locator('.collection-grid [data-card]').first().click();
  await page.screenshot({ path: 'tmp/qa/05-card-detail.png' });
  await page.locator('[data-action="close"]').click();
  await page.locator('#card-search').fill('nothing-matches-this');
  await page.getByText('No matching treasures yet').waitFor();
  await page.locator('[data-action="clear-filters"]').click();
  await page.screenshot({ path: 'tmp/qa/06-binder-desktop.png', fullPage: true });
  await page.locator('nav [data-nav="blocks"]').click();
  await page.locator('[data-action="start-game"]').click();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await page.locator('[data-game="hold"]').click();
  await page.locator('[data-action="pause"]').click();
  await page.getByText('Take a little breather').waitFor();
  await page.screenshot({ path: 'tmp/qa/07-blocks-desktop.png', fullPage: true });
  await page.locator('nav [data-nav="home"]').click();
  await page.locator('[data-action="background"]').click();
  await page.locator('#background-upload').setInputFiles('public/assets/previews/twilight-sparkle.png');
  await page.locator('[data-action="restore-background"]:not([disabled])').waitFor();
  await page.locator('[data-action="close"]').click();
  assert.equal(await page.locator('.custom-background').count(), 1);
  await page.reload();
  await page.locator('.custom-background').waitFor();
  await page.locator('[data-action="background"]').click();
  await page.locator('[data-action="restore-background"]').click();
  await page.locator('[data-action="close"]').click();
  assert.equal(await page.locator('.custom-background').count(), 0);
  await page.locator('[data-action="settings"]').click();
  await page.locator('#motion-setting').check();
  await page.locator('#display-name').fill('QA Friend');
  await page.locator('[data-action="save-name"]').click();
  await page.locator('[data-action="close"]').click();
  assert.ok((await page.locator('#pet-sprite').getAttribute('src')).endsWith('.png'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'tmp/qa/08-meadow-mobile.png', fullPage: true });
  for (const screen of ['home', 'shop', 'collection', 'blocks']) {
    await page.locator(`nav [data-nav="${screen}"]`).click();
    await page.screenshot({ path: `tmp/qa/mobile-${screen}.png`, fullPage: true });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `${screen} overflows at 390`,
    );
  }
  await page.setViewportSize({ width: 320, height: 740 });
  for (const screen of ['home', 'shop', 'collection', 'blocks']) {
    await page.locator(`nav [data-nav="${screen}"]`).click();
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `${screen} overflows at 320`,
    );
  }
  await page.screenshot({ path: 'tmp/qa/09-blocks-narrow.png', fullPage: true });
  assert.ok(
    await page
      .locator('.touch-controls')
      .evaluate(
        (el) =>
          el.getBoundingClientRect().bottom <= document.querySelector('nav').getBoundingClientRect().top,
      ),
    'Mobile touch controls fit above navigation',
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(assetErrors, []);
  console.log(
    JSON.stringify(
      {
        passed: true,
        checks:
          'starter, care, daily gift, persistence, pack interruption/recovery, purchases, collection filters/details, Tetris controls/pause, background upload/persistence/restore, settings, reduced motion, 390/320px layout',
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
