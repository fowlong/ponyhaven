// Companion navigation and touch layout, using a disposable local browser save.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

process.env.VITE_COMPANION = 'true';
process.env.VITE_REQUIRE_AUTH = 'false';
process.env.VITE_FIREBASE_API_KEY = '';
const server = await createServer({ configFile: false, envFile: false,
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
});
let browser;
try {
  await fs.mkdir('tmp/qa', { recursive: true });
  await server.listen();
  browser = await chromium.launch({ headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page.locator('[data-starter="twilight-sparkle"]').click();
  await page.locator('[data-action="begin"]').click();
  assert.equal(await page.locator('body.companion').count(), 1);
  assert.deepEqual(await page.locator('nav [data-nav]').evaluateAll(nodes => nodes.map(node => node.dataset.nav)),
    ['home', 'blocks', 'shop', 'collection']);
  await page.locator('nav [data-nav="blocks"]').tap();
  await page.locator('[data-action="start-game"]').tap();
  const xp = () => page.evaluate(() => JSON.parse(localStorage.getItem('ponyhaven:save:guest')).save.xp);
  const before = await xp();
  for (const action of ['left', 'rotate', 'right', 'drop', 'hold'])
    await page.locator(`[data-game="${action}"]`).tap();
  assert.ok(await xp() > before, 'Mobile block actions award current pony XP');
  await page.locator('[data-action="pause"]').tap();
  await page.getByText('Take a little breather').waitFor();
  for (const [width, height] of [[390,844], [320,740], [844,390]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(200);
    const fit = await page.evaluate(() => {
      const rect = selector => {
        const { x, y, width, height, bottom, right } = document.querySelector(selector).getBoundingClientRect();
        return { x, y, width, height, bottom, right };
      };
      const nav = document.querySelector('nav');
      return { board: rect('.board-wrap'), controls: rect('.touch-controls'),
        navTop: getComputedStyle(nav).position === 'fixed' ? rect('nav').y : innerHeight,
        pageWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
    });
    assert.ok(fit.board.y >= 0 && fit.board.bottom <= fit.controls.y, JSON.stringify(fit));
    assert.ok(fit.controls.bottom <= fit.navTop + 1, JSON.stringify(fit));
    assert.ok(fit.pageWidth <= fit.viewportWidth, JSON.stringify(fit));
    assert.equal(await page.locator('nav [data-nav]:visible').count(),4);
    await page.screenshot({ path: `tmp/qa/companion-blocks-${width}.png` });
  }
  await page.reload();
  await page.locator('[data-action="start-game"]').waitFor();
  assert.ok(await xp() > before, 'Mobile pony XP persists after reload');
  assert.deepEqual(errors, []);
  console.log('Mobile Magic Blocks passed: four tabs, touch controls, XP persistence, and board/control fit at 390×844, 320×740 and 844×390.');
} finally {
  await browser?.close();
  await server.close();
}
