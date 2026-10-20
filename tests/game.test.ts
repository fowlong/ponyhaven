import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Catalog } from '../src/types.ts';
import {
  awardXP,
  openLevelReward,
  grantPet,
  petDrops,
  happiness,
  levelForXP,
  levelFloor,
  migrateProgress,
  syncProgress,
  activeNPC,
  inviteNPC,
  HOUR,
  VISIT_DURATION,
  petChangeRemaining,
  buyCard,
  buyCaster,
  buyPack,
  care,
  changePet,
  chooseStarter,
  dailyGift,
  dailyShop,
  decay,
  freshSave,
  lineReward,
  readSave,
  seeded,
  unlockedPets,
} from '../src/game.ts';
import { Tetris } from '../src/tetris.ts';
const catalog: Catalog = {
  ponies: JSON.parse(fs.readFileSync('public/data/ponies.json', 'utf8')),
  cards: JSON.parse(fs.readFileSync('public/data/cards.json', 'utf8')),
  sets: JSON.parse(fs.readFileSync('public/data/sets.json', 'utf8')),
};
const now = Date.parse('2026-10-18T12:00:00Z');
test('catalog has every imported sprite, only collectible cards, exact IDs, valid pools and local animations', () => {
  assert.equal(catalog.ponies.length, 311);
  assert.ok(catalog.cards.length > 3000);
  assert.equal(new Set(catalog.cards.map((c) => c.id)).size, catalog.cards.length);
  for (const c of catalog.cards) {
    assert.ok(!/^(?:BP|BPE|SD|GD)\d+-/.test(c.code), c.code);
    assert.ok(c.sets.length);
    for (const s of c.sets) assert.ok(catalog.sets.some((set) => set.id === s));
    for (const id of c.ponyIds) assert.ok(catalog.ponies.some((p) => p.id === id));
  }
  for (const p of catalog.ponies)
    for (const b of [...p.behaviors, ...(p.effects || [])])
      for (const file of [b.left, b.right])
        assert.ok(fs.existsSync(path.join('public', decodeURIComponent(file))), file);
  for (const c of catalog.cards) {
    const file = path.join('public/assets/cards', c.id + '.webp');
    assert.ok(fs.statSync(file).size > 500, file);
  }
});
test('exactly one starter with correct card and sprite, regardless of later attempts', () => {
  for (const p of catalog.ponies.filter((p) => p.mane)) {
    const s = chooseStarter(freshSave(), p.id, catalog);
    assert.equal(s.coins, 600);
    assert.equal(s.pet?.ponyId, p.id);
    assert.equal(s.collection[p.starterCard!], 1);
    assert.throws(() => chooseStarter(s, 'rarity', catalog));
  }
});
test('daily stock is deterministic, unique and rotates through every pack', () => {
  const shop = dailyShop(catalog, now);
  assert.deepEqual(shop, dailyShop(catalog, now + 1000));
  assert.equal(shop.packs.length, 2);
  assert.equal(new Set(shop.singles.map((c) => c.id)).size, 5);
  assert.ok(shop.singles.every((c) => c.tier >= 4));
  assert.ok(shop.casters.every((c) => c.unicorn));
  const seen = new Set();
  for (let i = 0; i < catalog.sets.length; i++)
    for (const s of dailyShop(catalog, now + i * 86400000).packs) seen.add(s.id);
  assert.equal(seen.size, catalog.sets.length);
});
test('pack draws remain in their exact source pool and are awarded once before revealing', () => {
  for (let day = 0; day < 31; day++) {
    const time = now + day * 86400000;
    for (const set of dailyShop(catalog, time).packs) {
      const s = buyPack(freshSave(), set, catalog, seeded(set.id), time);
      assert.equal(s.coins, 600 - set.price);
      assert.equal(s.pendingPack!.cardIds.length, 5);
      assert.equal(
        Object.values(s.collection).reduce((n, c) => n + c, 0),
        5,
      );
      assert.ok(
        s.pendingPack!.cardIds.every((id) => catalog.cards.find((c) => c.id === id)!.sets.includes(set.id)),
      );
      assert.throws(() => buyPack(s, set, catalog, Math.random, time));
      const restored = readSave(JSON.parse(JSON.stringify(s)))!;
      assert.deepEqual(restored.pendingPack, s.pendingPack);
    }
  }
});
test('insufficient funds, stale stock, and same-day duplicate single purchases are rejected', () => {
  const shop = dailyShop(catalog, now),
    card = shop.singles[0];
  assert.throws(() => buyPack({ ...freshSave(), coins: 0 }, shop.packs[0], catalog, Math.random, now));
  assert.throws(() => buyCard({ ...freshSave(), coins: 0 }, card, catalog, now));
  const s = buyCard(freshSave(), card, catalog, now);
  assert.equal(s.collection[card.id], 1);
  assert.throws(() => buyCard(s, card, catalog, now));
  const stale = catalog.sets.find((s) => !shop.packs.some((p) => p.id === s.id))!;
  assert.throws(() => buyPack(freshSave(), stale, catalog, Math.random, now));
  const caster = shop.casters.find((c) => c.id !== 'twilight-sparkle')!;
  const c = buyCaster(freshSave(), caster.id, catalog, now);
  assert.equal(c.coins, 480);
  assert.throws(() => buyCaster(c, caster.id, catalog, now));
});
test('daily gift pays once per UTC day, and gentle decay cannot punish absent players indefinitely', () => {
  const s = dailyGift(freshSave('Friend', now), now);
  assert.equal(s.coins, 750);
  assert.throws(() => dailyGift(s, now + 1000));
  assert.equal(dailyGift(s, now + 86400000).coins, 900);
  const d = decay(s, now + 365 * 86400000);
  assert.ok(d.stats.food >= 15 && d.stats.joy >= 15 && d.stats.energy <= 100);
  assert.deepEqual(decay(s, now - 100000).stats, s.stats);
});
test('care effects, cooldown and friendship are saved without exceeding bounds', () => {
  const s = freshSave('Test', now);
  s.stats.food = 60;
  assert.equal(care(s, 'feed', now).stats.food, 80);
  const c = care(s, 'pet', now);
  assert.equal(c.stats.bond, 12);
  assert.throws(() => care(c, 'pet', now + 1000));
  assert.equal(care(c, 'pet', now + 3000).stats.bond, 14);
});
test('pet unlocks are explicit and switching is unlimited, preserving each pony’s progress across rarities', () => {
  const s = chooseStarter(freshSave(), 'twilight-sparkle', catalog);
  const card = catalog.cards.find((c) => c.ponyIds.includes('rarity') && c.rarity === 'SR')!;
  s.collection[card.id] = 2;
  assert.equal(unlockedPets(s, catalog.cards).length, 1);
  const pet = { ponyId: 'rarity', rarity: 'SR', tier: 2 };
  grantPet(s, pet);
  grantPet(s, pet);
  assert.equal(unlockedPets(s, catalog.cards).length, 2);
  s.xp = 43;
  s.stats.food = 61;
  syncProgress(s);
  const changed = changePet(s, pet, catalog.cards, now);
  assert.equal(changed.xp, 0);
  changed.xp = 77;
  changed.dirt = 0.5;
  const back = changePet(changed, s.pet!, catalog.cards, now);
  assert.equal(back.xp, 43);
  assert.ok(back.stats.food <= 61);
  const again = changePet(back, pet, catalog.cards, now);
  assert.equal(again.xp, 77);
  assert.equal(again.dirt, 0.5);
  assert.equal(petChangeRemaining(again, now), 0);
  const variant = { ponyId: 'rarity', rarity: 'UR', tier: 4 };
  grantPet(again, variant);
  assert.equal(changePet(again, variant, catalog.cards, now).xp, 77);
});
test('level gifts stay sealed across reloads and grant exactly once when opened', () => {
  const s = chooseStarter(freshSave(), 'twilight-sparkle', catalog);
  s.xp = 99;
  syncProgress(s);
  const before = Object.values(s.collection).reduce((a, b) => a + b, 0);
  awardXP(s, 1, catalog, seeded('level'));
  assert.equal(levelForXP(s.xp), 2);
  assert.equal(s.levelRewards.length, 1);
  assert.ok(catalog.cards.find((c) => c.id === s.levelRewards[0].cardId)!.tier >= 4);
  assert.equal(
    Object.values(s.collection).reduce((a, b) => a + b, 0),
    before,
  );
  awardXP(s, 1, catalog);
  assert.equal(s.levelRewards.length, 1);
  assert.equal(levelFloor(3), 300);
  const loaded = readSave(JSON.parse(JSON.stringify(s)))!;
  awardXP(loaded, 1, catalog);
  assert.equal(loaded.levelRewards.length, 1);
  assert.equal(loaded.levelRewards[0].pending, true);
  const revealed = openLevelReward(loaded);
  const cardId = loaded.levelRewards[0].cardId;
  assert.equal(revealed.collection[cardId], (loaded.collection[cardId] || 0) + 1);
  assert.equal(revealed.levelRewards[0].pending, false);
  assert.deepEqual(openLevelReward(readSave(JSON.parse(JSON.stringify(revealed)))!), revealed);
});
test('sealed gifts defer pet unlocks; legacy queued gifts are never granted twice', () => {
  const s = chooseStarter(freshSave(), 'twilight-sparkle', catalog);
  s.xp = 99;
  syncProgress(s);
  const before = structuredClone(s.petUnlocks);
  const gifts = { ...catalog, cards: [catalog.cards.find(c => c.tier === 7 && c.ponyIds.length)!] };
  awardXP(s, 1, gifts, () => 0.99);
  assert.equal(s.levelRewards[0].pending, true);
  assert.ok(s.levelRewards[0].petDrop);
  assert.deepEqual(s.petUnlocks, before);
  const revealed = openLevelReward(s);
  assert.equal(revealed.petUnlocks.length, before.length + 1);
  assert.equal(openLevelReward(revealed).petUnlocks.length, before.length + 1);
  const legacy = structuredClone(revealed);
  delete legacy.levelRewards[0].pending;
  assert.deepEqual(openLevelReward(readSave(legacy)!), legacy);
});
test('opening one gift leaves later gifts sealed and handles an already-unlocked pet', () => {
  const s = chooseStarter(freshSave(), 'twilight-sparkle', catalog);
  const gifts = { ...catalog, cards: [catalog.cards.find(c => c.tier === 7 && c.ponyIds.length)!] };
  awardXP(s, 500, gifts, () => 0.99);
  assert.equal(s.levelRewards.length, 2);
  const pet = s.levelRewards[0].petDrop!;
  grantPet(s, pet); // The same pet can be earned elsewhere while a gift is sealed.
  const before = structuredClone(s.collection);
  const revealed = openLevelReward(s);
  assert.equal(revealed.levelRewards[0].petDrop, null);
  assert.equal(revealed.levelRewards[1].pending, true);
  const card = revealed.levelRewards[0].cardId;
  assert.equal(revealed.collection[card], (before[card] || 0) + 1);
  const second = openLevelReward({ ...revealed, levelRewards: revealed.levelRewards.slice(1) });
  assert.equal(second.collection[card], (before[card] || 0) + 2);
});
test('ordinary packs have one 20% pet roll; the top two tiers always grant a matching pet', () => {
  const card = catalog.cards.find((c) => c.tier === 2 && c.ponyIds.length === 1)!;
  let success = 0;
  const random = seeded('drop-distribution');
  for (let i = 0; i < 10000; i++) {
    const s = freshSave();
    const drops = petDrops(s, [card, card, card, card, card], random);
    assert.ok(drops.length <= 1);
    success += drops.length;
  }
  assert.ok(success > 1800 && success < 2200, String(success));
  for (const tier of [6, 7]) {
    const c = catalog.cards.find((c) => c.tier === tier && c.ponyIds.length)!;
    const s = freshSave();
    assert.equal(petDrops(s, [c], () => 0.99).length, 1);
    assert.equal(petDrops(s, [c], () => 0.99).length, 0);
  }
});
test('playing adds dirt and consumes tummy/energy; feeding, brushing and collision bath ticks restore needs', () => {
  const s = chooseStarter(freshSave('Test', now), 'twilight-sparkle', catalog);
  const p = care(s, 'play', now);
  assert.equal(p.dirt, 0.25);
  assert.equal(p.stats.food, 77);
  assert.equal(p.stats.energy, 81);
  assert.equal(p.stats.wellbeing, 79);
  const washed = care(p, 'bath', now + 800);
  assert.ok(Math.abs(washed.dirt - 0.11) < 0.001);
  assert.ok(Math.abs(washed.stats.wellbeing - 87) < 0.001);
  assert.throws(() => care(washed, 'bath', now + 1000));
  const brushed = care(p, 'brush', now + 3000);
  assert.equal(brushed.dirt, 0);
  assert.equal(brushed.stats.wellbeing, 100);
  const fed = care(p, 'feed', now + 3000);
  assert.ok(fed.stats.food > p.stats.food && fed.stats.energy > p.stats.energy);
  for (const key of ['food', 'joy', 'energy', 'wellbeing', 'bond']) {
    const copy = structuredClone(s);
    copy.stats[key as keyof typeof copy.stats] = 0;
    assert.ok(happiness(copy) < happiness(s), key);
  }
});
test('daily pack bags do not repeat yesterday and cover every series', () => {
  let previous: string[] = [];
  const seen = new Set();
  for (let i = 0; i < 366; i++) {
    const packs = dailyShop(catalog, now + i * 86400000).packs;
    assert.equal(new Set(packs.map((p) => p.id)).size, 2);
    assert.ok(packs.every((p) => !previous.includes(p.id)));
    previous = packs.map((p) => p.id);
    for (const p of packs) seen.add(p.id);
  }
  assert.equal(seen.size, catalog.sets.length);
});
test('early preview migration retains earned pets and transfers existing XP to the selected pony', () => {
  const s = chooseStarter(freshSave(), 'twilight-sparkle', catalog);
  s.xp = 245;
  s.petUnlocks = [];
  s.ponyProgress = {};
  migrateProgress(s, catalog);
  assert.ok(s.petUnlocks.length);
  assert.equal(s.ponyProgress['twilight-sparkle'].xp, 245);
  assert.equal(s.ponyProgress['twilight-sparkle'].rewardedLevel, 2);
});
test('NPC visits last exactly twenty minutes and invitations reset after an hour, including after reload', () => {
  const original = chooseStarter(freshSave(), 'twilight-sparkle', catalog);
  const s = inviteNPC(original, catalog, () => 0.5, now);
  assert.notEqual(s.npc!.ponyId, s.pet!.ponyId);
  assert.equal(s.npc!.expiresAt, now + VISIT_DURATION);
  assert.equal(s.npcCooldownUntil, now + HOUR);
  const loaded = readSave(JSON.parse(JSON.stringify(s)))!;
  assert.ok(activeNPC(loaded, now + VISIT_DURATION - 1));
  assert.equal(activeNPC(loaded, now + VISIT_DURATION), null);
  assert.throws(() => inviteNPC(loaded, catalog, Math.random, now + HOUR - 1));
  assert.ok(inviteNPC(loaded, catalog, Math.random, now + HOUR).npc);
  assert.equal(original.npc, null);
});
test('older saves migrate hourly/NPC fields and invalid backups are rejected', () => {
  const old: any = freshSave();
  delete old.npc;
  delete old.npcCooldownUntil;
  delete old.lastPetChangeAt;
  old.lastPetChange = '2026-10-17';
  const loaded = readSave(old)!;
  assert.equal(loaded.npc, null);
  assert.equal(loaded.npcCooldownUntil, 0);
  assert.equal(loaded.lastPetChangeAt, 0);
  assert.equal(readSave({ ...old, stats: { food: 50 } }), null);
  assert.equal(readSave({ ...old, coins: Infinity }), null);
  assert.equal(readSave({ ...old, pendingPack: { cardIds: [], setId: 'x' } }), null);
});
test('line reward economy includes combos and back-to-back fours', () => {
  assert.equal(lineReward(1), 40);
  assert.equal(lineReward(4), 300);
  assert.equal(lineReward(2, 3), 190);
  assert.equal(lineReward(4, 1, true), 430);
  assert.equal(lineReward(0, 8, true), 0);
});
test('Tetris seven-bag, wall collision, hold limit and pause', () => {
  const g = new Tetris();
  assert.equal(new Set([g.piece!.type, ...g.queue.slice(0, 6)]).size, 7);
  const p = JSON.stringify(g.piece);
  assert.equal(g.move(-1), false);
  assert.equal(JSON.stringify(g.piece), p);
  g.start();
  for (let i = 0; i < 30; i++) g.move(-1);
  assert.ok(g.piece!.x >= 0);
  g.hold();
  const held = g.held;
  g.hold();
  assert.equal(g.held, held);
  assert.equal(g.canHold, false);
  g.hardDrop();
  assert.equal(g.canHold, true);
});
test('Tetris clears four rows atomically and awards one reward', () => {
  const rewards: number[] = [];
  const g = new Tetris((c) => rewards.push(c));
  g.start();
  for (let y = 16; y < 20; y++) g.board[y] = Array.from({ length: 10 }, (_, x) => (x === 4 ? 0 : 2));
  g.piece = { type: 1, matrix: [[1], [1], [1], [1]], x: 4, y: 0 };
  g.hardDrop();
  assert.equal(g.lines, 4);
  assert.equal(g.coins, 300);
  assert.deepEqual(rewards, [300]);
  assert.ok(g.board.every((r) => r.every((v) => v === 0)));
});
test('Tetris consecutive clears get combo, ghost matches drop, and blocked spawn ends play', () => {
  const g = new Tetris();
  g.start();
  g.board[19] = Array.from({ length: 10 }, (_, x) => (x < 4 ? 0 : 2));
  g.piece = { type: 1, matrix: [[1, 1, 1, 1]], x: 0, y: 0 };
  assert.equal(g.ghostY(), 19);
  g.hardDrop();
  g.board[19] = Array.from({ length: 10 }, (_, x) => (x < 4 ? 0 : 2));
  g.piece = { type: 1, matrix: [[1, 1, 1, 1]], x: 0, y: 0 };
  g.hardDrop();
  assert.equal(g.coins, 110);
  g.board[0].fill(2);
  g.spawn(2);
  assert.equal(g.over, true);
  assert.equal(g.paused, true);
});
