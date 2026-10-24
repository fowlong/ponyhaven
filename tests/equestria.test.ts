import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, readSave } from '../src/game';
import { equestriaReward } from '../src/equestria-rewards';
import { EQUESTRIA_REFRESH_MS, EQUESTRIA_BOSSES, chestReadyAt } from '../src/equestria-state';
import type { Catalog } from '../src/types';
import { readFileSync } from 'node:fs';

const catalog: Catalog = {
  cards: JSON.parse(readFileSync('public/data/cards.json', 'utf8')),
  ponies: JSON.parse(readFileSync('public/data/ponies.json', 'utf8')),
  sets: [],
};
const at = Date.UTC(2026, 9, 21, 10);
const claim = { kind: 'chest', chest: 0, sequence: 1, at } as const;

test('old saves migrate to exactly 50 unopened chests', () => {
  const old = { ...freshSave() } as any;
  delete old.equestria;
  const save = readSave(old)!;
  assert.equal(save.equestria.chests.length, 50);
  assert.equal(chestReadyAt(save.equestria, 0), 0);
  assert.equal(chestReadyAt(save.equestria, 50), Infinity);
});

test('each chest grants one rare card, never a bonus pet, and survives restart', () => {
  let save = freshSave();
  for (let chest = 0; chest < 50; chest++) save = equestriaReward(save, catalog, { ...claim, chest }, () => 0.9).save;
  assert.equal(Object.values(save.collection).reduce((a, b) => a + b, 0), 50);
  assert.equal(save.petUnlocks.length, 0);
  assert.ok(Object.keys(save.collection).every(id => catalog.cards.find(c => c.id === id)!.tier >= 4));
  save = readSave(JSON.parse(JSON.stringify(save)))!;
  assert.ok(save);
  assert.equal(equestriaReward(save, catalog, claim).save, save);
  assert.equal(save.recentCards.length, 1);
});

test('pet chest unlocks one new pet without adding a card', () => {
  const result = equestriaReward(freshSave(), catalog, claim, () => 0);
  assert.equal(result.save.petUnlocks.length, 1);
  assert.equal(Object.keys(result.save.collection).length, 0);
  const again = equestriaReward(result.save, catalog, { ...claim, chest: 1 }, () => 0);
  assert.equal(again.save.petUnlocks.length, 2);
  assert.notEqual(again.save.petUnlocks[0].ponyId, again.save.petUnlocks[1].ponyId);
});

test('refill is 24 elapsed hours, with replay and clock rollback rejected', () => {
  const save = equestriaReward(freshSave(), catalog, claim).save;
  assert.equal(chestReadyAt(save.equestria, 0), at + EQUESTRIA_REFRESH_MS);
  for (const time of [at - 1, at + 1, at + EQUESTRIA_REFRESH_MS - 1])
    assert.equal(equestriaReward(save, catalog, { ...claim, sequence: 2, at: time }).save, save);
  const refreshed = equestriaReward(save, catalog, { ...claim, sequence: 2, at: at + EQUESTRIA_REFRESH_MS });
  assert.notEqual(refreshed.save, save);
  assert.equal(equestriaReward(refreshed.save, catalog, { ...claim, at: at + EQUESTRIA_REFRESH_MS * 5 }).save, refreshed.save);
});

test('cumulative rings and quests pay once, including reordered snapshots', () => {
  const first = equestriaReward(freshSave(), catalog, { kind: 'progress', rings: 12, quests: 2 });
  assert.equal(first.bits, 420);
  assert.equal(equestriaReward(first.save, catalog, { kind: 'progress', rings: 12, quests: 2 }).save, first.save);
  assert.equal(equestriaReward(first.save, catalog, { kind: 'progress', rings: 11, quests: 1 }).save, first.save);
  assert.equal(equestriaReward(first.save, catalog, { kind: 'progress', rings: 13, quests: 2 }).bits, 10);
});

test('malformed chest claims and corrupt saves do not grant rewards', () => {
  const save = freshSave();
  for (const event of [{ ...claim, chest: -1 }, { ...claim, chest: 50 }, { ...claim, sequence: 3 }, { ...claim, at: NaN }])
    assert.equal(equestriaReward(save, catalog, event).save, save);
  const bad = structuredClone(save);
  bad.equestria.chests[0].openedAt = NaN;
  assert.equal(readSave(bad), null);
});

test('seven books persist across reload and reject unknown or repeated unlocks',()=>{
 let save=freshSave();
 for(let book=1;book<=7;book++)save=equestriaReward(save,catalog,{kind:'book',book}).save;
 save=readSave(JSON.parse(JSON.stringify(save)))!;
 assert.equal(Object.keys(save.equestria.books!).length,7);
 for(const book of [0,1,7,8,1.5])assert.equal(equestriaReward(save,catalog,{kind:'book',book}).save,save);
 assert.equal(save.petUnlocks.length,0);
 assert.equal(readSave({...save,equestria:{...save.equestria,books:{8:true}}}),null);
});
test('each named boss awards exactly itself once, including replay after reload',()=>{
 let save=freshSave();const before=save.coins;
 for(const boss of EQUESTRIA_BOSSES){
  save=equestriaReward(save,catalog,{kind:'boss',boss}).save;
  assert.ok(save.petUnlocks.some(p=>p.ponyId===boss&&p.rarity==='Boss'));
 }
 save=readSave(JSON.parse(JSON.stringify(save)))!;
 assert.equal(save.petUnlocks.length,16);assert.equal(save.coins,before);assert.equal(Object.keys(save.collection).length,0);
 for(const boss of [...EQUESTRIA_BOSSES,'not-a-boss'])assert.equal(equestriaReward(save,catalog,{kind:'boss',boss}).save,save);
});
