import test from 'node:test';
import assert from 'node:assert/strict';
import { equestriaMismatch, readPartyGame } from '../src/party-game';

const build = { protocol: 1, worldHash: 'a'.repeat(64), gameplayHash: 'b'.repeat(64) };
const session = '11111111-1111-4111-8111-111111111111';

test('party messages support native games and require complete Equestria compatibility metadata', () => {
  assert.deepEqual(readPartyGame({ game: 'adventure', map: 1, command: 'ignore' }), { game: 'adventure', map: 1 });
  assert.deepEqual(readPartyGame({ game: 'ponykart', map: 1035, pack: build.worldHash }), { game: 'ponykart', map: 1035, pack: build.worldHash });
  assert.deepEqual(readPartyGame({ game: 'equestria', session, ...build, port: 30000, rewards: ['untrusted'] }), { game: 'equestria', session, ...build });
  for (const v of [null, [], { game: 'other', map: 1 }, { game: 'adventure', map: 0 }, { game: 'ponykart', map: 1.5 },
    { game: 'adventure', map: 1, pack: '../anything' }, { game: 'equestria', ...build },
    { game: 'equestria', session, ...build, worldHash: 'not-a-hash' },
    { game: 'equestria', session, ...build, protocol: NaN }]) assert.equal(readPartyGame(v), null);
});

test('Equestria compatibility rejects different map, gameplay or protocol before joining', () => {
  assert.equal(equestriaMismatch(build, build), null);
  assert.match(equestriaMismatch(build, undefined)!, /Install/);
  assert.match(equestriaMismatch(build, { ...build, worldHash: 'c'.repeat(64) })!, /map differs/);
  assert.match(equestriaMismatch(build, { ...build, gameplayHash: 'c'.repeat(64) })!, /game files differ/);
  assert.match(equestriaMismatch({ ...build, protocol: 2 }, { ...build, protocol: 2 })!, /multiplayer version/);
});
