// Isolated renderer/profile regression; no real key, account, or user save is used.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Profiles } from '../desktop/profiles.mjs';
import { verifyLicense } from '../desktop/license.mjs';

await fs.mkdir('tmp/qa', { recursive: true });
const root = await fs.mkdtemp(path.resolve('tmp/activation-regression-'));
const profiles = new Profiles(root, {
  isEncryptionAvailable: () => true,
  encryptString: value => Buffer.from(value),
  decryptString: value => value.toString(),
}, 'test-product');
await profiles.init();
const server = await createServer({ configFile: false, envFile: false,
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  let requests = 0, accept = false, releaseRequest;
  const api = {
    status: () => profiles.status(), load: () => profiles.read(), save: value => profiles.write(value),
    engines: async () => ({ adventure: false, ponykart: false }), levels: async () => [],
    activate: async (key, name) => {
      requests++;
      await new Promise(resolve => { releaseRequest = resolve; });
      const receipt = await verifyLicense(key, 'test-product', async () => {
        if (!accept) throw Error('Simulated offline request');
        return new Response(JSON.stringify({ success: true, purchase: { product_id: 'test-product' } }));
      });
      return profiles.activate(receipt, name);
    },
  };
  await context.exposeBinding('__qaIPC', (_source, name, args) => api[name](...args));
  await context.addInitScript(() => {
    window.ponyDesktop = {};
    for (const name of ['status', 'load', 'save', 'activate', 'engines', 'levels'])
      window.ponyDesktop[name] = (...args) => window.__qaIPC(name, args);
    window.ponyDesktop.onGame = window.ponyDesktop.onPacket = () => () => {};
  });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  const activate = page.locator('[data-action="activate"]');
  await activate.click();
  assert.equal(requests, 0, 'Empty form must not send an activation request');
  await page.locator('#activation-name').fill('charris');
  await page.locator('#activation-key').fill('QA-FAKE-INVITATION-ONLY');
  console.log('Activation form ready:', await activate.isEnabled(), await activate.boundingBox());
  await page.screenshot({ path: 'tmp/qa/activation-before-submit.png' });
  await activate.click();
  await page.waitForFunction(() => document.querySelector('[data-action="activate"]').textContent === 'Checking invitation…');
  assert.equal(await activate.isDisabled(), true);
  await requestReady();
  releaseRequest(); releaseRequest = undefined;
  await page.waitForFunction(() => !document.querySelector('[data-action="activate"]').disabled);
  assert.match(await page.locator('body').innerText(), /Could not reach Gumroad/);
  assert.equal(profiles.status().activated, false);
  accept = true;
  await activate.click();
  await requestReady();
  releaseRequest(); releaseRequest = undefined;
  await page.locator('.starter-grid').waitFor();
  assert.equal(profiles.status().activated, true);
  assert.equal(profiles.status().profile.name, 'charris');
  await page.reload();
  await page.locator('.starter-grid').waitFor();
  assert.equal(requests, 2, 'Restart must not verify an already activated profile again');
  await page.screenshot({ path: 'tmp/qa/activation-regression.png' });
  assert.deepEqual(errors, []);
  console.log('Activation regression passed: empty-form validation, busy feedback, failure/retry, charris activation, transition to starter selection, and restart persistence.');
  async function requestReady() {
    const deadline=Date.now()+10000;
    while (!releaseRequest && Date.now()<deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(releaseRequest, 'The activation IPC request should reach the main process');
  }
} finally {
  await browser?.close();
  await server.close();
}
