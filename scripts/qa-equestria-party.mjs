// Real PeerJS/WebRTC and loopback UDP; the echo endpoint is deliberately not a Luanti gameplay test.
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { fork } from 'node:child_process';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { LocalRelay } from '../desktop/relay.mjs';

const build = { protocol: 1, worldHash: 'a'.repeat(64), gameplayHash: 'b'.repeat(64) };
const firstSession = '11111111-1111-4111-8111-111111111111';
const secondSession = '22222222-2222-4222-8222-222222222222';
const clients = [], sockets = [];
let broker, browser, server;
async function until(fn, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 50)); }
  throw new Error('Party check timed out.');
}
async function udp() {
  const socket = dgram.createSocket('udp4'); sockets.push(socket);
  await new Promise(r => socket.bind(0, '127.0.0.1', r)); return socket;
}
async function exchange(socket, port, payload) {
  const response = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', received); reject(Error('UDP/WebRTC exchange timed out.')); }, 5000);
    function received(bytes) { clearTimeout(timer); resolve(bytes); }
    socket.once('message', received);
  });
  socket.send(payload, port, '127.0.0.1');
  assert.deepEqual(await response, payload);
}
async function client(name) {
  const context = await browser.newContext(), page = await context.newPage();
  console.log('Opening party client:', name);
  const errors = [], opens = [];
  const relay = new LocalRelay(p => void page.evaluate(p => window.packetListeners.forEach(fn => fn(p)), p).catch(() => {}));
  const api = {
    status: async () => ({ activated: true, profile: { id: name, name, createdAt: 1 }, profiles: [] }),
    relayOpen: o => { opens.push(o); return relay.open(o); },
    relaySend: (id, bytes) => relay.send(id, bytes), relayClose: id => relay.close(id),
    equestriaInvite: async (_peer, identity) => ({name:'ph_'+createHash('sha256').update(identity.uid).digest('hex').slice(0,16),password:randomBytes(24).toString('hex')}),
    equestriaRevoke: async () => {}, equestriaAck: async () => {},
  };
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if(m.type()==='error') console.log(name,m.text()); });
  page.on('requestfailed', r => console.log(name,'request failed',r.url(),r.failure()?.errorText));
  page.on('websocket', ws => ws.on('socketerror', error => console.log(name,'WebSocket',error)));
  await page.exposeBinding('partyIPC', (_source, method, args) => api[method](...args));
  await context.addInitScript(() => {
    window.packetListeners = []; window.ponyDesktop = { onPacket: fn => window.packetListeners.push(fn) };
    for (const method of ['status', 'relayOpen', 'relaySend', 'relayClose', 'equestriaInvite', 'equestriaRevoke', 'equestriaAck']) window.ponyDesktop[method] = (...args) => window.partyIPC(method, args);
  });
  // Serve a real loopback response: route.fulfill has no network address and
  // recent Chromium treats its subsequent loopback WebSocket as public-to-local.
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tmp/equestria-party-fixture.html`);
  await Promise.race([page.evaluate(async name => {
    await (await import('/src/desktop.ts')).refreshDesktop();
    const { PeerParty } = await import('/src/peer-party.ts');
    window.qaParty = new PeerParty({ host: '127.0.0.1', port: 19001, path: '/ponyhaven', secure: false, debug: 2, config: { iceServers: [] } });
    window.qaIdentity = {uid:name,displayName:name,pony:'twilight',state:(await import('/src/equestria-state.ts')).freshEquestria()};
    window.guestPort = build => window.qaParty.guestPort(build,window.qaIdentity);
  },name), new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Party client initialization timed out: '+name)),20000);timer.unref();})]);
  const c = { page, context, relay, errors, opens }; clients.push(c); return c;
}

try {
  await fs.mkdir('tmp',{recursive:true});await fs.writeFile('tmp/equestria-party-fixture.html','<!doctype html><title>Party protocol fixture</title>');
  server = await createServer({ configFile: false, envFile: false, optimizeDeps: { noDiscovery: true, include: ['peerjs'] }, server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  await server.listen();
  console.log('Party fixture server ready.');
  broker = fork(new URL('./qa-peer-server.mjs', import.meta.url), [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true });
  await new Promise((resolve, reject) => {
    const timer=setTimeout(()=>reject(Error('Peer server did not become ready.')),10000);
    broker.once('message',()=>{clearTimeout(timer);resolve();});broker.once('error',e=>{clearTimeout(timer);reject(e);});
    broker.once('exit',code=>{clearTimeout(timer);reject(Error('Peer server exited: '+code));});
  });
  console.log('Local invite service ready.');
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const host = await client('Host'), guest = await client('Guest'), secondGuest = await client('SecondGuest');
  console.log('Three browser clients ready.');
  const code = await host.page.evaluate(() => window.qaParty.create('Host', 'meadow', '', 'day'));
  assert.match(code, /^[A-Z2-9]{8}$/);
  await guest.page.evaluate(code => window.qaParty.join(code), code);
  console.log('First guest joined by invite code.');
  const endpoint = await udp(), received = [];
  endpoint.on('message', (bytes, remote) => { received.push({ bytes, port: remote.port }); endpoint.send(bytes, remote.port, remote.address); });
  const announce = async session => host.page.evaluate(({ build, session, port }) => window.qaParty.hostGame({ game: 'equestria', session, ...build }, port), { build, session, port: endpoint.address().port });
  const waitGame = (c, session) => until(() => c.page.evaluate(session => window.qaParty.game?.session === session, session));
  await announce(firstSession); await waitGame(guest, firstSession);
  assert.equal(host.relay.sockets.size, 0, 'Announcement alone must not open a host relay.');
  for (const invalid of [undefined, { ...build, worldHash: 'c'.repeat(64) }, { ...build, gameplayHash: 'c'.repeat(64) }, { ...build, protocol: 2 }]) {
    const error = await guest.page.evaluate(async build => { try { await window.guestPort(build); return ''; } catch (e) { return e.message; } }, invalid);
    assert.ok(error, 'Different builds must be rejected.');
    assert.equal(guest.opens.length, 0); assert.equal(host.opens.length, 0);
  }
  // A peer cannot bypass the host's check by sending an invented readiness message.
  await guest.page.evaluate(({ build, session }) => new Promise(resolve => {
    const c = [...window.qaParty.connections.values()][0];
    const response = data => { if(data.type==='equestria-rejected') { c.off('data',response); resolve(); } };
    c.on('data',response);
    c.send({ type: 'equestria-ready', session, build: { ...build, worldHash: 'c'.repeat(64) } });
    c.send({ type: 'packet', session, bytes: [99] });
  }), { build, session: firstSession });
  const guestPort = await guest.page.evaluate(build => window.guestPort(build), build);
  assert.equal(host.opens.length, 1); assert.equal(received.length, 0);
  const guestSocket = await udp();
  await exchange(guestSocket, guestPort, Buffer.from('hello Equestria transport'));
  await exchange(guestSocket, guestPort, Buffer.from(Array.from({ length: 8192 }, (_, i) => i % 256)));
  const beforeReplay = received.length;
  await guest.page.evaluate(session => [...window.qaParty.connections.values()][0].send({ type: 'packet', session, bytes: [77] }), secondSession);
  await exchange(guestSocket, guestPort, Buffer.from('ordered marker'));
  assert.equal(received.length, beforeReplay + 1, 'Packets from a different game session must be ignored.');

  // A late guest negotiates independently and receives its own loopback endpoint.
  await secondGuest.page.evaluate(code => window.qaParty.join(code), code); await waitGame(secondGuest, firstSession);
  const otherPort = await secondGuest.page.evaluate(build => window.guestPort(build), build), otherSocket = await udp();
  await exchange(otherSocket, otherPort, Buffer.from('second pony'));
  assert.equal(new Set(received.map(p => p.port)).size, 2);
  await guest.page.evaluate(() => window.qaParty.leave());
  await until(() => host.relay.sockets.size === 1);
  await guest.page.evaluate(code => window.qaParty.join(code), code); await waitGame(guest, firstSession);
  const reconnectPort = await guest.page.evaluate(build => window.guestPort(build), build);
  await exchange(guestSocket, reconnectPort, Buffer.from('rejoined pony'));

  await announce(secondSession); await waitGame(guest, secondSession); await waitGame(secondGuest, secondSession);
  assert.equal(host.relay.sockets.size, 0); assert.equal(guest.relay.sockets.size, 0); assert.equal(secondGuest.relay.sockets.size, 0);
  const nextPort = await guest.page.evaluate(build => window.guestPort(build), build);
  const beforeOldSession = received.length;
  await guest.page.evaluate(session => [...window.qaParty.connections.values()][0].send({ type: 'packet', session, bytes: [66] }), firstSession);
  await exchange(guestSocket, nextPort, Buffer.from('new session'));
  assert.equal(received.length, beforeOldSession + 1);
  await host.page.evaluate(() => window.qaParty.leave());
  await until(() => guest.page.evaluate(() => !window.qaParty.game && !window.qaParty.room));
  await until(() => guest.relay.sockets.size === 0 && secondGuest.relay.sockets.size === 0);
  for (const c of clients) assert.deepEqual(c.errors, []);
  console.log('Equestria party transport passed: invite code, matching-world handshake, mismatches, 8192-byte UDP exchange, isolated guests, late join, reconnect, stale sessions, and host shutdown. Luanti gameplay was not exercised.');
} finally {
  for (const c of clients) { await c.page.evaluate(() => window.qaParty.leave()).catch(() => {}); c.relay.close(); }
  for (const socket of sockets) socket.close();
  if (browser) await browser.close();
  if (broker && broker.exitCode === null) { const exited = new Promise(r => broker.once('exit', r)); broker.kill(); await exited; }
  if (server) await server.close();
}
