// Visible-window inspection through the production launcher, with disposable saves.
import { NativeGames } from '../desktop/games.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const game = process.argv[2] || 'adventure';
const root = path.resolve('tmp/native-window-' + game + '-' + Date.now());
await fs.mkdir(root, {recursive:true});
const events = [];
const runner = new NativeGames(path.resolve(process.env.QA_NATIVE_ROOT || 'native'), root, event => events.push(event));
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await runner.stop();
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
try {
  const session = await runner.launch({
    game, pony:'twilight', map:1, mode:'solo',
    fullscreen:process.argv.includes('--fullscreen'),
  }, {id:'window-test', name:'Window Test'});
  assert.deepEqual(events.slice(0, 2).map(e => e.type), ['loading', 'started']);
  const logs = (await fs.readdir(root, {recursive:true})).filter(file => /(?:^|[\\/])log[^\\/]*\.txt$/.test(file));
  const diagnostics = runner.running.stderr + (await Promise.all(logs.map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n');
  assert.match(diagnostics, /Ponyhaven startup window hidden: 1/);
  assert.match(diagnostics, /Ponyhaven native window visible: 1/);
  console.log(game, 'visible Windows window confirmed; loading -> started -> progress', session, root);
  const deadline = setTimeout(() => void stop(), process.argv.includes('--quick') ? 8000 : 180000);
  while (runner.running) await new Promise(resolve => setTimeout(resolve, 250));
  clearTimeout(deadline);
  assert.equal(events.at(-1)?.type, 'ended');
  await fs.writeFile(path.join(root, 'events.json'), JSON.stringify(events, null, 2));
  console.log(game, 'closed cleanly; evidence saved to', root);
} finally {
  await stop();
}
