// Local-only integration test. The hard-coded demo project cannot reach production.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { initializeApp as adminApp } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  serverTimestamp,
  setLogLevel,
} from 'firebase/firestore';
import { chromium } from 'playwright';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:18080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:19099';
const projectId = 'demo-ponyhaven';
adminApp({ projectId });
const owner = adminFirestore(),
  accounts = adminAuth();
const password = 'Only-For-Local-Tests-123';
const identities = [
  ['qa-host', 'host', 'Host'],
  ['qa-guest', 'guest', 'Guest'],
  ['qa-uninvited', 'uninvited', 'Uninvited'],
];
for (const [uid, username, name] of identities) {
  await accounts.deleteUser(uid).catch(() => {});
  await accounts.createUser({ uid, email: username + '@ponyhaven.example', password, displayName: name });
  await owner.doc('players/' + uid).delete();
  await owner.doc('meadow/' + uid).delete();
  await owner.doc('invitations/' + uid).delete();
  if (uid !== 'qa-uninvited') await owner.doc('allowedUsers/' + uid).set({ enabled: true, name });
  else await owner.doc('allowedUsers/' + uid).delete();
}
setLogLevel('silent');
const apps = [];
async function client(username) {
  const app = initializeApp(
    { projectId, apiKey: 'fake-local-test-key', authDomain: projectId + '.firebaseapp.com' },
    username,
  );
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:19099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 18080);
  if (username !== 'anonymous')
    await signInWithEmailAndPassword(auth, username + '@ponyhaven.example', password);
  return db;
}
let browser;
try {
  const host = await client('host'),
    guest = await client('guest'),
    uninvited = await client('uninvited'),
    anonymous = await client('anonymous');
  const save = { version: 1, coins: 600, collection: {}, ponyProgress: {}, petUnlocks: [], name: 'Host' };
  await setDoc(doc(host, 'players', 'qa-host'), { save, revision: 1, updatedAt: serverTimestamp() });
  await assert.rejects(() => getDoc(doc(guest, 'players', 'qa-host')), /permission/i);
  await assert.rejects(
    () => setDoc(doc(guest, 'players', 'qa-host'), { save, revision: 2, updatedAt: serverTimestamp() }),
    /permission/i,
  );
  await assert.rejects(
    () => setDoc(doc(host, 'players', 'qa-host'), { save, revision: 3, updatedAt: serverTimestamp() }),
    /permission/i,
  );
  await setDoc(doc(host, 'players', 'qa-host'), { save, revision: 2, updatedAt: serverTimestamp() });
  await assert.rejects(() => setDoc(doc(host, 'allowedUsers', 'qa-host'), { enabled: true }), /permission/i);
  await assert.rejects(() => getDocs(collection(host, 'allowedUsers')), /permission/i);
  await assert.rejects(() => getDocs(collection(uninvited, 'meadow')), /permission/i);
  await assert.rejects(() => getDocs(collection(anonymous, 'meadow')), /permission/i);
  const room = {
    hostUid: 'qa-host',
    hostName: 'Host',
    background: 'ponyville-meadow',
    customBackground: '',
    time: 'day',
    updatedAt: serverTimestamp(),
    expiresAt: Date.now() + 1800000,
  };
  await owner.doc('rooms/TESTABCD').delete();
  await setDoc(doc(host, 'rooms', 'TESTABCD'), room);
  assert.ok((await getDoc(doc(guest, 'rooms', 'TESTABCD'))).exists());
  await assert.rejects(
    () => setDoc(doc(guest, 'rooms', 'TESTABCD'), { ...room, hostUid: 'qa-guest', background: 'other' }),
    /permission/i,
  );
  await assert.rejects(() => getDocs(collection(guest, 'rooms')), /permission/i);
  await assert.rejects(
    () =>
      setDoc(doc(host, 'rooms', 'TESTABCD'), {
        ...room,
        customBackground: 'https://example.com/invalid.png',
      }),
    /permission/i,
  );
  await owner.doc('players/qa-host').delete();
  await owner.doc('rooms/TESTABCD').delete();
  console.log(
    'Access rules: password accounts accepted; uninvited access, cross-account saves, stale revisions, allowlist changes, room listing and guest background writes rejected.',
  );

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 1280, height: 960 } }),
    browser.newContext({ viewport: { width: 390, height: 844 } }),
    browser.newContext(),
  ]);
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const [a, b, c] = pages;
  const errors = [];
  pages.forEach((p) => p.on('pageerror', (e) => errors.push(e.message)));
  async function login(page, name) {
    await page.goto(process.env.QA_URL || 'http://127.0.0.1:5175/');
    await page.locator('#login-account').fill(name);
    await page.locator('#login-password').fill(password);
    await page.locator('[data-action="login"]').click();
  }
  await login(c, 'uninvited');
  await c.getByText('This account has not been invited yet.', { exact: false }).waitFor();
  await login(a, 'host');
  await a.locator('[data-starter="twilight-sparkle"]').click();
  await a.locator('[data-action="begin"]').click();
  await login(b, 'guest');
  await b.locator('[data-starter="rarity"]').click();
  await b.locator('[data-action="begin"]').click();
  await a.locator('[data-action="gift"]').click();
  await a.waitForFunction(() => document.querySelector('[data-sync]')?.textContent === 'Cloud saved');
  await a.reload();
  await a.locator('#meadow-scene').waitFor();
  assert.equal(await a.locator('[data-wallet]').innerText(), '750');
  assert.equal(await b.locator('[data-wallet]').innerText(), '600');
  await a.locator('[data-action="friends"]').click();
  await a.locator('[data-action="host-meadow"]').click();
  await a.locator('.join-code strong').waitFor();
  const code = await a.locator('.join-code strong').innerText();
  assert.match(code, /^[A-Z2-9]{8}$/);
  await a.locator('#online-friends option[value="qa-guest"]').waitFor({ state: 'attached' });
  await a.locator('#online-friends').selectOption('qa-guest');
  await a.locator('[data-action="invite-player"]').click();
  await b.locator('#social-invitation').waitFor();
  await b.locator('[data-action="accept-invite"]').click();
  await b.locator('.friend-pony[data-uid="qa-host"]').waitFor();
  await a.locator('[data-action="close"]').click();
  await a.locator('.friend-pony[data-uid="qa-guest"]').waitFor();
  assert.equal(await b.locator('[data-action="next-background"]').isDisabled(), true);
  await a.locator('[data-action="next-background"]').click();
  await a.waitForFunction(
    () => !document.querySelector('#meadow-scene')?.style.backgroundImage.includes('assets/meadow.svg'),
  );
  const bg = await a.locator('#meadow-scene').evaluate((el) => el.style.backgroundImage);
  await b.waitForFunction(
    (value) => document.querySelector('#meadow-scene')?.style.backgroundImage === value,
    bg,
  );
  assert.notEqual(bg, 'url("/assets/meadow.svg")');
  await fs.mkdir('tmp/qa', { recursive: true });
  await a.screenshot({ path: 'tmp/qa/19-shared-host.png' });
  await b.screenshot({ path: 'tmp/qa/20-shared-guest.png' });
  await b.locator('[data-action="friends"]').click();
  await b.locator('[data-action="leave-meadow"]').click();
  await b.locator('#join-code').fill(code);
  await b.locator('[data-action="join-meadow"]').click();
  await b.locator('.join-code strong').waitFor();
  await b.locator('[data-action="close"]').click();
  await a.locator('[data-action="background"]').click();
  await a.locator('#background-upload').setInputFiles('public/assets/previews/twilight-sparkle.png');
  await a.locator('[data-action="restore-background"]:not([disabled])').waitFor();
  await a.locator('[data-action="close"]').click();
  await b.waitForFunction(() =>
    document.querySelector('#meadow-scene')?.style.backgroundImage.includes('data:image/webp;base64,'),
  );
  await a.locator('[data-action="friends"]').click();
  await a.locator('[data-action="leave-meadow"]').click();
  await b.locator('.friend-pony[data-uid="qa-host"]').waitFor({ state: 'detached' });
  assert.equal(await b.locator('[data-action="next-background"]').isDisabled(), false);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: true,
        checks:
          'local Firebase rules, password login, uninvited denial, separate cloud collections/wallets, reload persistence, online list, invitations, join codes, host-only backgrounds, custom shared background, room close',
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  if (browser) await browser.close();
  for (const app of apps) await deleteApp(app);
  await owner.terminate();
}
