import type { Catalog, Save } from './types';
import { grantPet, journal } from './game';
import { chestReadyAt, EQUESTRIA_CHESTS, EQUESTRIA_BOSSES } from './equestria-state';
import {rememberAdventure} from './equestria-saves';

export type EquestriaRewardEvent =
  | { kind: 'chest'; chest: number; sequence: number; at: number }
  | { kind: 'book'; book: number }
  | { kind: 'boss'; boss: string }
  | { kind: 'progress'; rings: number; quests: number };

/** The host supplies time and cumulative counters; never accept item IDs from a game. */
export function equestriaReward(save: Save, catalog: Catalog, event: EquestriaRewardEvent, random = Math.random) {
 const result=reward(save,catalog,event,random);if(result.save!==save)rememberAdventure(result.save);return result;
}
function reward(save: Save, catalog: Catalog, event: EquestriaRewardEvent, random:()=>number) {
  const unchanged = { save, bits: 0, message: '' };
  if (!event || !save.equestria) return unchanged;
  if(event.kind==='book'){
    if(!Number.isInteger(event.book)||event.book<1||event.book>7||save.equestria.books?.[event.book])return unchanged;
    const next=structuredClone(save);(next.equestria.books||={})[event.book]=true;
    const name=['Risier','Fiera','Disperim','Sanium','Expol','Flurra','Fulst'][event.book-1];
    const message=`Found the ${name} spellbook. Press ${event.book} to equip it in Equestria.`;journal(next,message);
    return {save:next,bits:0,message};
  }
  if(event.kind==='boss'){
    if(!EQUESTRIA_BOSSES.has(event.boss)||save.equestria.bosses?.[event.boss])return unchanged;
    const pony=catalog.ponies.find(p=>p.id===event.boss);if(!pony)return unchanged;
    const next=structuredClone(save);(next.equestria.bosses||={})[event.boss]=true;
    grantPet(next,{ponyId:pony.id,rarity:'Boss',tier:6});
    const message=`Defeated ${pony.name}: they joined your virtual pets!`;journal(next,message);
    return {save:next,bits:0,message};
  }
  if (event.kind === 'progress') {
    if (![event.rings, event.quests].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1e9)) return unchanged;
    const rings = Math.max(0, event.rings - save.equestria.rings);
    const quests = Math.max(0, event.quests - save.equestria.quests);
    if (!rings && !quests) return unchanged;
    const next = structuredClone(save), bits = rings * 10 + quests * 150;
    next.equestria.rings = Math.max(next.equestria.rings, event.rings);
    next.equestria.quests = Math.max(next.equestria.quests, event.quests);
    next.equestria.bits += bits;
    next.coins += bits;
    return { save: next, bits, message: quests ? 'A delivery made a friend smile. +150 bits per quest.' : '' };
  }
  if (event.kind !== 'chest' || !Number.isInteger(event.chest) || event.chest < 0 || event.chest >= EQUESTRIA_CHESTS ||
      !Number.isSafeInteger(event.at) || event.at <= 0 || event.at > 8.64e15 ||
      event.sequence !== save.equestria.chests[event.chest].sequence + 1 ||
      event.at < chestReadyAt(save.equestria, event.chest)) return unchanged;
  const pick = <T>(items: T[]): T => items[Math.min(items.length - 1, Math.max(0, Math.floor(random() * items.length)))];
  const rare = catalog.cards.filter(c => c.tier >= 4 && c.tier <= 7);
  const pets = catalog.ponies.filter(p => !save.petUnlocks.some(u => u.ponyId === p.id));
  if (!rare.length && !pets.length) return unchanged;
  const next = structuredClone(save);
  let message: string;
  if (pets.length && (!rare.length || random() < 0.35)) {
    const pony = pick(pets);
    grantPet(next, { ponyId: pony.id, rarity: 'Equestria', tier: 4 });
    message = `Treasure ${event.chest + 1}: ${pony.name} joined your pets!`;
  } else {
    const card = pick(rare);
    next.collection[card.id] = (next.collection[card.id] || 0) + 1;
    next.recentCards = [card.id, ...next.recentCards.filter(id => id !== card.id)].slice(0, 100);
    // A treasure is ONE item: rare cards do not run the pack's bonus-pet roll.
    message = `Treasure ${event.chest + 1}: ${card.name} (${card.rarity}) joined your collection!`;
  }
  next.equestria.chests[event.chest] = { openedAt: event.at, sequence: event.sequence };
  journal(next, message);
  return { save: next, bits: 0, message };
}
