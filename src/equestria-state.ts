import bosses from './equestria-bosses.json';
export const EQUESTRIA_BOSSES = new Set(bosses.map(b=>b.id));
export const EQUESTRIA_CHESTS = 50;
export const EQUESTRIA_REFRESH_MS = 86_400_000;
/** Elements of Harmony experience categories, in display order. */
export const HARMONY_ELEMENTS = ['honesty','kindness','laughter','generosity','loyalty','magic'] as const;
export type HarmonyElement = typeof HARMONY_ELEMENTS[number];

export interface EquestriaProgress {
  chests: { openedAt: number; sequence: number }[];
  rings: number;
  quests: number;
  bits: number;
  books?: Record<string, true>;
  bosses?: Record<string, true>;
  /** Cumulative experience per Element of Harmony; absent on older saves. */
  harmony?: Partial<Record<HarmonyElement, number>>;
}

export function freshEquestria(): EquestriaProgress {
  return { chests: Array.from({ length: EQUESTRIA_CHESTS }, () => ({ openedAt: 0, sequence: 0 })), rings: 0, quests: 0, bits: 0, books:{}, bosses:{} };
}

export function validEquestria(value: unknown): value is EquestriaProgress {
  const p = value as EquestriaProgress;
  const count = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= 1e12;
  return !!p && Array.isArray(p.chests) && p.chests.length === EQUESTRIA_CHESTS &&
    p.chests.every(c => c && Number.isSafeInteger(c.openedAt) && c.openedAt >= 0 && c.openedAt <= 8.64e15 && count(c.sequence) && (c.sequence === 0 ? c.openedAt === 0 : c.openedAt > 0)) &&
    [p.rings, p.quests, p.bits].every(count) &&
    (p.books===undefined || !!p.books && typeof p.books==='object' && Object.entries(p.books).every(([k,v])=>/^[1-7]$/.test(k)&&v===true)) &&
    (p.bosses===undefined || !!p.bosses && typeof p.bosses==='object' && Object.entries(p.bosses).every(([k,v])=>EQUESTRIA_BOSSES.has(k)&&v===true)) &&
    (p.harmony===undefined || !!p.harmony && typeof p.harmony==='object' && Object.entries(p.harmony).every(([k,v])=>(HARMONY_ELEMENTS as readonly string[]).includes(k)&&count(v)&&Number(v)<=1e9));
}

/** Level from cumulative XP: 300 XP for level 2, then 150 more per level, so
 * levels take several Friendship Emergencies. Mirrored in friendship.lua. */
export function harmonyLevel(xp: number) {
  let level = 1, need = 300, left = Math.max(0, Math.floor(xp));
  while (left >= need) { left -= need; level++; need += 150; }
  return { level, into: left, need };
}

export function chestReadyAt(progress: EquestriaProgress, chest: number): number {
  const claim = progress.chests[chest];
  return claim ? (claim.sequence ? claim.openedAt + EQUESTRIA_REFRESH_MS : 0) : Infinity;
}
