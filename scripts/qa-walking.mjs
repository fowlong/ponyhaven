import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'no-preference',
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(process.env.QA_URL || 'http://127.0.0.1:5173/');
  await page.locator('[data-starter="rarity"]').click();
  await page.locator('[data-action="begin"]').click();
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
    [320, 740],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator('#pet-sprite').evaluate((img) => img.decode());
    for (const side of ['left', 'right']) {
      const scene = page.locator('#meadow-scene');
      const rect = await scene.boundingBox();
      await scene.click({ position: { x: side === 'left' ? 4 : rect.width - 4, y: rect.height - 48 } });
      console.log(`Checking ${width}px ${side} boundary`);
      await page
        .waitForFunction(
          (side) => {
            const scene = document.querySelector('#meadow-scene'),
              sr = scene.getBoundingClientRect();
            const pr = document.querySelector('#pet-wrap').getBoundingClientRect();
            const x = ((pr.left + pr.width / 2 - sr.left) / sr.width) * 100;
            const target = Number(side === 'left' ? scene.dataset.walkMin : scene.dataset.walkMax);
            // The ambient timer can settle a walk one render frame before the CSS transition completes.
            return Math.abs(target - x) < 3;
          },
          side,
          { timeout: 6000 },
        )
        .catch(async (error) => {
          console.log(
            await scene.evaluate((el) => ({
              bounds: [el.dataset.walkMin, el.dataset.walkMax],
              className: document.body.className,
              left: el.querySelector('#pet-wrap').style.left,
              transition: getComputedStyle(el.querySelector('#pet-wrap')).transition,
              behavior: el.dataset.behavior,
              sprite: el.querySelector('#pet-sprite').src,
              outer: el.getBoundingClientRect().toJSON(),
              actor: el.querySelector('#pet-wrap').getBoundingClientRect().toJSON(),
            })),
          );
          await page.screenshot({ path: `tmp/qa/walking-failure-${width}-${side}.png`, fullPage: true });
          throw error;
        });
      assert.match(await page.locator('#pet-sprite').getAttribute('src'), new RegExp(side));
    }
    await page.locator('[data-care="play"]').click();
    for (let tick = 0; tick < 10; tick++) {
      await page.waitForTimeout(500);
      const valid = await page.locator('#meadow-scene').evaluate((scene) => {
        const sr = scene.getBoundingClientRect(),
          wr = scene.querySelector('#pet-wrap').getBoundingClientRect(),
          pr = scene.querySelector('#pet-sprite').getBoundingClientRect();
        const x = ((wr.left + wr.width / 2 - sr.left) / sr.width) * 100;
        return (
          x >= Number(scene.dataset.walkMin) - 1 &&
          x <= Number(scene.dataset.walkMax) + 1 &&
          Math.abs(pr.bottom - sr.top - Number(scene.dataset.floor)) < 1
        );
      });
      assert.ok(valid, `Play escaped the floor or lane at ${width}px`);
    }
    await page.locator('[data-action="next-background"]').click();
  }
  assert.deepEqual(errors, []);
  console.log(
    'Walking passed: both edges, correct facing, play bounds and floor contact at desktop, 390px and 320px.',
  );
} finally {
  await browser.close();
}
