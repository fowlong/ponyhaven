import type { Card, CardSet, Catalog, PetChoice, Save } from './types';
import { freshArcade, validArcade } from './arcade-progress';
export const DAY = 86_400_000;
export const HOUR = 3_600_000;
export const VISIT_DURATION = 20 * 60_000;
export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
export const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
export function freshSave(name = 'Friend', now = Date.now()): Save {
  return {
    version: 1,
    name,
    createdAt: now,
    updatedAt: now,
    coins: 600,
    collection: {},
    recentCards: [],
    pet: null,
    starterId: null,
    lastPetChangeAt: 0,
    casters: ['twilight-sparkle'],
    caster: 'twilight-sparkle',
    stats: { food: 85, joy: 85, energy: 90, bond: 10, wellbeing: 95 },
    statsAt: now,
    xp: 0,
    dirt: 0,
    petUnlocks: [],
    ponyProgress: {},
    levelRewards: [],
    bathAt: 0,
    dailyReward: '',
    purchases: {},
    totalLines: 0,
    bestScore: 0,
    openedPacks: 0,
    pendingPack: null,
    journal: ['A little adventure is about to begin.'],
    careAt: 0,
    friendshipAt: 0,
    npc: null,
    npcCooldownUntil: 0,
    arcade: freshArcade(),
  };
}
export function readSave(value: unknown): Save | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Save;
  if (
    v.version !== 1 ||
    typeof v.coins !== 'number' ||
    !Number.isFinite(v.coins) ||
    v.coins < 0 ||
    !v.collection ||
    typeof v.collection !== 'object' ||
    Array.isArray(v.collection) ||
    !v.stats ||
    !Array.isArray(v.casters) ||
    !Array.isArray(v.journal)
  )
    return null;
  if (Object.values(v.collection).some((n) => !Number.isInteger(n) || n < 0 || n > 1e6)) return null;
  if (
    ['food', 'joy', 'energy', 'bond'].some((key) => !Number.isFinite(v.stats[key as keyof Save['stats']])) ||
    Object.values(v.stats).some((n) => !Number.isFinite(n) || n < 0 || n > 100) ||
    !Number.isFinite(v.statsAt)
  )
    return null;
  if (v.npc && (!v.npc.ponyId || !Number.isFinite(v.npc.expiresAt) || !Number.isFinite(v.npc.invitedAt)))
    return null;
  if (
    v.pendingPack &&
    (!Array.isArray(v.pendingPack.cardIds) || v.pendingPack.cardIds.length !== 5 || !v.pendingPack.setId)
  )
    return null;
  if (v.pet && (!v.pet.ponyId || !v.pet.rarity || !Number.isFinite(v.pet.tier))) return null;
  const s = {
    ...freshSave(),
    ...v,
    stats: { ...v.stats, wellbeing: v.stats.wellbeing ?? 95 },
    name: String(v.name || 'Friend').slice(0, 24),
    purchases: v.purchases || {},
    recentCards: Array.isArray(v.recentCards) ? v.recentCards.filter(id => typeof id === 'string' && v.collection[id]).slice(0, 100) : Object.keys(v.collection).reverse().slice(0, 100),
    pendingPack: v.pendingPack || null,
    arcade: v.arcade || freshArcade(),
  };
  if (!validArcade(s.arcade)) return null;
  if (
    !Array.isArray(s.petUnlocks) ||
    !Array.isArray(s.levelRewards) ||
    !s.ponyProgress ||
    typeof s.ponyProgress !== 'object'
  )
    return null;
  if (
    !Number.isFinite(s.xp) ||
    s.xp < 0 ||
    !Number.isFinite(s.dirt) ||
    s.dirt < 0 ||
    s.dirt > 1 ||
    s.casters.some((id) => typeof id !== 'string') ||
    s.journal.some((j) => typeof j !== 'string')
  )
    return null;
  if (
    s.petUnlocks.some(
      (p) =>
        !p ||
        typeof p.ponyId !== 'string' ||
        typeof p.rarity !== 'string' ||
        !Number.isInteger(p.tier) ||
        p.tier < 0 ||
        p.tier > 7,
    )
  )
    return null;
  for (const p of Object.values(s.ponyProgress))
    if (
      !p ||
      !Number.isFinite(p.xp) ||
      p.xp < 0 ||
      !p.stats ||
      ['food', 'joy', 'energy', 'bond', 'wellbeing'].some(
        (key) =>
          !Number.isFinite(p.stats[key as keyof Save['stats']]) ||
          p.stats[key as keyof Save['stats']] < 0 ||
          p.stats[key as keyof Save['stats']] > 100,
      ) ||
      !Number.isFinite(p.statsAt) ||
      !Number.isFinite(p.dirt) ||
      p.dirt < 0 ||
      p.dirt > 1 ||
      !Number.isInteger(p.rewardedLevel) ||
      p.rewardedLevel < 1
    )
      return null;
  if (
    s.levelRewards.some(
      (r) =>
        !r ||
        typeof r.ponyId !== 'string' ||
        typeof r.cardId !== 'string' ||
        !Number.isInteger(r.level) ||
        r.level < 2 ||
        (r.pending !== undefined && typeof r.pending !== 'boolean') ||
        (r.petDrop != null && (
          typeof r.petDrop.ponyId !== 'string' ||
          typeof r.petDrop.rarity !== 'string' ||
          !Number.isInteger(r.petDrop.tier) || r.petDrop.tier < 0 || r.petDrop.tier > 7
        )),
    )
  )
    return null;
  if (
    !s.casters.length ||
    !s.casters.includes(s.caster) ||
    [s.careAt, s.friendshipAt, s.bathAt, s.npcCooldownUntil].some((n) => !Number.isFinite(n) || n < 0)
  )
    return null;
  return s;
}
export function decay(save: Save, now = Date.now()): Save {
  const hours = Math.max(0, Math.min(24, (now - save.statsAt) / 3600000));
  return {
    ...save,
    statsAt: Math.max(save.statsAt, now),
    stats: {
      ...save.stats,
      food: clamp(save.stats.food - hours * 2.2, 15),
      joy: clamp(save.stats.joy - hours * 1.5, 15),
      energy: clamp(save.stats.energy + hours * 2, 15),
      wellbeing: clamp(save.stats.wellbeing - hours * 0.6, 15),
    },
  };
}
export function journal(save: Save, message: string): void {
  save.journal = [message, ...save.journal].slice(0, 12);
}
export function chooseStarter(save: Save, ponyId: string, catalog: Catalog): Save {
  if (save.starterId) throw new Error('Your first friend is already chosen.');
  const p = catalog.ponies.find((p) => p.id === ponyId && p.mane);
  const card = catalog.cards.find((c) => c.id === p?.starterCard);
  if (!p || !card) throw new Error('Choose one of the Mane 6.');
  const s = structuredClone(save);
  s.starterId = p.id;
  s.pet = { ponyId: p.id, rarity: card.rarity, tier: card.tier };
  s.collection[card.id] = 1;
  grantPet(s, s.pet);
  syncProgress(s);
  journal(s, `${p.name} became your first friend.`);
  return s;
}
export function unlockedPets(save: Save, _cards: Card[]): PetChoice[] {
  return save.petUnlocks || [];
}
export const levelForXP = (xp: number) => Math.floor((1 + Math.sqrt(1 + Math.max(0, xp) * 0.08)) / 2);
export const levelFloor = (level: number) => 50 * (level - 1) * level;
export function syncProgress(save: Save): Save {
  if (save.pet) {
    const previous = save.ponyProgress[save.pet.ponyId];
    save.ponyProgress[save.pet.ponyId] = {
      xp: save.xp,
      stats: { ...save.stats },
      statsAt: save.statsAt,
      dirt: save.dirt,
      rewardedLevel: previous?.rewardedLevel || 1,
    };
  }
  return save;
}
export function migrateProgress(save: Save, catalog: Catalog): Save {
  // Preserve pets earned in the early preview. New games use explicit pet drops.
  if (save.pet && !save.petUnlocks.length) {
    const found = new Map<string, PetChoice>();
    for (const c of catalog.cards)
      if (save.collection[c.id])
        for (const id of c.ponyIds)
          found.set(id + ':' + c.rarity, { ponyId: id, rarity: c.rarity, tier: c.tier });
    save.petUnlocks = [...found.values()];
    grantPet(save, save.pet);
  }
  if (save.pet && !save.ponyProgress[save.pet.ponyId]) {
    syncProgress(save);
    save.ponyProgress[save.pet.ponyId].rewardedLevel = levelForXP(save.xp);
  }
  return save;
}
export function changePet(save: Save, pet: PetChoice, cards: Card[], now = Date.now()): Save {
  if (!unlockedPets(save, cards).some((p) => p.ponyId === pet.ponyId && p.rarity === pet.rarity))
    throw new Error('Find this companion in a pack to invite them.');
  if (save.pet?.ponyId === pet.ponyId && save.pet.rarity === pet.rarity)
    throw new Error('This pony is already with you.');
  const s = syncProgress(structuredClone(save));
  s.pet = pet;
  const progress = s.ponyProgress[pet.ponyId] || {
    xp: 0,
    stats: { food: 85, joy: 85, energy: 90, bond: 10, wellbeing: 95 },
    statsAt: now,
    dirt: 0,
    rewardedLevel: 1,
  };
  s.xp = progress.xp;
  s.stats = { ...progress.stats };
  s.statsAt = progress.statsAt;
  s.dirt = progress.dirt;
  return syncProgress(decay(s, now));
}
// Kept for migration compatibility with early preview saves.
export const petChangeRemaining = (_save: Save, _now = Date.now()) => 0;
export const happiness = (save: Save) =>
  Math.round(
    save.stats.food * 0.22 +
      save.stats.energy * 0.21 +
      save.stats.wellbeing * 0.22 +
      save.stats.joy * 0.25 +
      save.stats.bond * 0.1,
  );
export function grantPet(save: Save, pet: PetChoice): boolean {
  if (save.petUnlocks.some((p) => p.ponyId === pet.ponyId && p.rarity === pet.rarity)) return false;
  save.petUnlocks.push({ ...pet });
  return true;
}
function cardPet(card: Card, random: () => number): PetChoice | null {
  if (!card.ponyIds.length) return null;
  return {
    ponyId: card.ponyIds[Math.min(card.ponyIds.length - 1, Math.floor(random() * card.ponyIds.length))],
    rarity: card.rarity,
    tier: card.tier,
  };
}
export function petDrops(save: Save, cards: Card[], random = Math.random): PetChoice[] {
  const drops: PetChoice[] = [];
  for (const card of cards.filter((c) => c.tier >= 6)) {
    const pet = cardPet(card, random);
    if (pet && grantPet(save, pet)) drops.push(pet);
  }
  const possible = cards.filter((c) => c.tier < 6 && c.ponyIds.length);
  if (random() < 0.2 && possible.length) {
    const card = possible[Math.min(possible.length - 1, Math.floor(random() * possible.length))];
    const pet = cardPet(card, random);
    if (pet && grantPet(save, pet)) drops.push(pet);
  }
  return drops;
}
export function awardXP(save: Save, amount: number, catalog: Catalog, random = Math.random): Save {
  if (!save.pet || amount <= 0) return save;
  save.xp += Math.min(500, amount);
  syncProgress(save);
  const progress = save.ponyProgress[save.pet.ponyId];
  const level = levelForXP(save.xp);
  const tiers = [4, 5, 6, 7].filter((t) => catalog.cards.some((c) => c.tier === t));
  for (let n = progress.rewardedLevel + 1; n <= level; n++) {
    const tier = tiers[Math.min(tiers.length - 1, Math.floor(random() * tiers.length))];
    const pool = catalog.cards.filter((c) => c.tier === tier);
    const card = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
    // Reserve the roll now, without exposing the card or pet before its reveal.
    // Include earlier reserved pets so two unopened gifts do not promise the same unlock.
    const reservedPets = save.levelRewards.flatMap(r => r.pending && r.petDrop ? [r.petDrop] : []);
    const drops = petDrops({ ...save, petUnlocks: [...save.petUnlocks, ...reservedPets] }, [card], random);
    save.levelRewards.push({ ponyId: save.pet.ponyId, level: n, cardId: card.id, petDrop: drops[0] || null, pending: true });
    journal(
      save,
      `Level ${n} with ${catalog.ponies.find((p) => p.id === save.pet!.ponyId)?.name}: a ${card.rarity} card gift.`,
    );
  }
  progress.rewardedLevel = level;
  return save;
}
export function openLevelReward(save: Save): Save {
  if (!save.levelRewards[0]?.pending) return save;
  const s = structuredClone(save);
  const reward = s.levelRewards[0];
  s.collection[reward.cardId] = (s.collection[reward.cardId] || 0) + 1;
  if (reward.petDrop && !grantPet(s, reward.petDrop)) reward.petDrop = null;
  reward.pending = false;
  return s;
}
export function inviteNPC(save: Save, catalog: Catalog, random = Math.random, now = Date.now()): Save {
  if (now < save.npcCooldownUntil)
    throw new Error(`Invite another friend in ${Math.ceil((save.npcCooldownUntil - now) / 60000)} minutes.`);
  const available = catalog.ponies.filter((p) => p.id !== save.pet?.ponyId);
  const guest = available[Math.min(available.length - 1, Math.floor(random() * available.length))];
  if (!guest) throw new Error('No visitors are available just now.');
  const s = structuredClone(save);
  s.npc = { ponyId: guest.id, invitedAt: now, expiresAt: now + VISIT_DURATION };
  s.npcCooldownUntil = now + HOUR;
  journal(s, `${guest.name} dropped by for a 20-minute playdate.`);
  return s;
}
export const activeNPC = (save: Save, now = Date.now()) =>
  save.npc && save.npc.expiresAt > now ? save.npc : null;
export function care(
  save: Save,
  action: 'feed' | 'play' | 'rest' | 'pet' | 'brush' | 'bath' | 'transform',
  now = Date.now(),
): Save {
  if (action === 'bath' ? now - save.bathAt < 750 : now - save.careAt < 2500)
    throw new Error('Give your pony a little moment.');
  const s = decay(structuredClone(save), now);
  if (action === 'bath') s.bathAt = now;
  else s.careAt = now;
  if (action === 'feed') {
    s.stats.food = clamp(s.stats.food + 20);
    s.stats.energy = clamp(s.stats.energy + 8);
    s.stats.joy = clamp(s.stats.joy + 3);
  }
  if (action === 'play') {
    s.stats.joy = clamp(s.stats.joy + 18);
    s.stats.energy = clamp(s.stats.energy - 9, 15);
    s.stats.food = clamp(s.stats.food - 8, 15);
    s.stats.wellbeing = clamp(s.stats.wellbeing - 16, 5);
    s.dirt = clamp(s.dirt + 0.25, 0, 1);
  }
  if (action === 'rest') s.stats.energy = clamp(s.stats.energy + 22);
  if (action === 'pet') {
    s.stats.joy = clamp(s.stats.joy + 8);
    s.stats.bond = clamp(s.stats.bond + 2);
  }
  if (action === 'brush') {
    s.dirt = 0;
    s.stats.wellbeing = clamp(s.stats.wellbeing + 28);
  }
  if (action === 'bath') {
    s.dirt = Math.max(0, s.dirt - 0.14);
    s.stats.wellbeing = clamp(s.stats.wellbeing + 8);
  }
  return syncProgress(s);
}
export function dailyGift(save: Save, now = Date.now()): Save {
  if (save.dailyReward === dayKey(now)) throw new Error('Today’s gift is already tucked away.');
  const s = { ...save, dailyReward: dayKey(now), coins: save.coins + 150 };
  journal(s, 'Collected 150 bits from the daily gift.');
  return s;
}
export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(arr: T[], random = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function dailyShop(catalog: Catalog, now = Date.now()) {
  const day = Math.floor(now / DAY),
    sets = [...catalog.sets].sort((a, b) => a.id.localeCompare(b.id));
  const bag = (round: number) => {
    const current = shuffle(sets, seeded('packs:' + round));
    if (sets.length >= 8) {
      const previous = shuffle(sets, seeded('packs:' + (round - 1)))
        .slice(-3)
        .map((s) => s.id);
      for (let i = 0; i < 3; i++)
        if (previous.includes(current[i].id)) {
          const j = current.findIndex((s, j) => j >= 3 && j < sets.length - 3 && !previous.includes(s.id));
          if (j >= 0) [current[i], current[j]] = [current[j], current[i]];
        }
    }
    return current;
  };
  const packs = [0, 1]
    .map((offset) => {
      const position = day * 2 + offset;
      return bag(Math.floor(position / sets.length))[position % sets.length];
    })
    .filter(Boolean);
  const rare = catalog.cards.filter((c) => c.tier >= 4);
  const singles = shuffle(rare, seeded(dayKey(now) + 'singles')).slice(0, 5);
  const casters = shuffle(
    catalog.ponies.filter((p) => p.unicorn && !p.id.includes('filly') && !p.id.includes('foal')),
    seeded(dayKey(now) + 'unicorns'),
  ).slice(0, 3);
  return { packs, singles, casters };
}
export const cardPrice = (card: Card) => [15, 20, 30, 45, 80, 120, 180, 240][clamp(card.tier, 0, 7)];
function draw(pool: Card[], random: () => number): Card {
  const weight = (c: Card) => [40, 35, 23, 14, 8, 5, 3, 1][clamp(c.tier, 0, 7)];
  let pick = random() * pool.reduce((n, c) => n + weight(c), 0);
  for (const c of pool) {
    pick -= weight(c);
    if (pick <= 0) return c;
  }
  return pool[pool.length - 1];
}
export function buyPack(
  save: Save,
  set: CardSet,
  catalog: Catalog,
  random = Math.random,
  now = Date.now(),
): Save {
  if (save.pendingPack) throw new Error('Open your waiting pack first.');
  if (!dailyShop(catalog, now).packs.some((p) => p.id === set.id))
    throw new Error('The shop has refreshed. Choose one of today’s packs.');
  if (save.coins < set.price) throw new Error('A few more bits! Play Magic Blocks to earn some.');
  const pool = catalog.cards.filter((c) => c.sets.includes(set.id));
  if (!pool.length) throw new Error('This pack is not available.');
  const rare = pool.filter((c) => c.tier >= 3);
  const cards = Array.from({ length: 5 }, (_, i) => draw(i === 4 && rare.length ? rare : pool, random));
  const s = structuredClone(save);
  s.coins -= set.price;
  s.openedPacks++;
  s.pendingPack = { setId: set.id, cardIds: cards.map((c) => c.id), petDrops: petDrops(s, cards, random) };
  for (const card of cards) s.collection[card.id] = (s.collection[card.id] || 0) + 1;
  journal(s, `Opened ${set.name}: five new little treasures.`);
  return awardXP(s, 5, catalog, random);
}
export function buyCard(save: Save, card: Card, catalog: Catalog, now = Date.now()): Save {
  const today = dayKey(now);
  if (!dailyShop(catalog, now).singles.some((c) => c.id === card.id))
    throw new Error('This card is no longer in today’s shop.');
  if (save.purchases[today]?.includes(card.id)) throw new Error('You already picked up this daily card.');
  const price = cardPrice(card);
  if (save.coins < price) throw new Error('Earn a few more bits in Magic Blocks.');
  const s = structuredClone(save);
  s.coins -= price;
  s.collection[card.id] = (s.collection[card.id] || 0) + 1;
  s.purchases = { [today]: [...(s.purchases[today] || []), card.id] };
  petDrops(s, [card]);
  journal(s, `${card.name} (${card.rarity}) joined your collection.`);
  return awardXP(s, 3, catalog);
}
export function buyCaster(save: Save, id: string, catalog: Catalog, now = Date.now()): Save {
  if (save.casters.includes(id)) throw new Error('This magic companion is already yours.');
  if (!dailyShop(catalog, now).casters.some((p) => p.id === id))
    throw new Error('This companion is not in today’s shop.');
  if (save.coins < 120) throw new Error('You need 120 bits for this companion.');
  return awardXP(
    { ...structuredClone(save), coins: save.coins - 120, casters: [...save.casters, id] },
    4,
    catalog,
  );
}
export function lineReward(lines: number, combo = 0, backToBack = false): number {
  return (
    ([0, 40, 100, 180, 300][lines] || 0) +
    (lines ? Math.max(0, combo) * 30 : 0) +
    (lines === 4 && backToBack ? 100 : 0)
  );
}
