import bosses from './equestria-bosses.json';
export const EQUESTRIA_BOSSES = new Set(bosses.map(b=>b.id));
export const EQUESTRIA_CHESTS = 50;
export const EQUESTRIA_REFRESH_MS = 86_400_000;

export interface EquestriaProgress {
  chests: { openedAt: number; sequence: number }[];
  rings: number;
  quests: number;
  bits: number;
  books?: Record<string, true>;
  bosses?: Record<string, true>;
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
    (p.bosses===undefined || !!p.bosses && typeof p.bosses==='object' && Object.entries(p.bosses).every(([k,v])=>EQUESTRIA_BOSSES.has(k)&&v===true));
}

export function chestReadyAt(progress: EquestriaProgress, chest: number): number {
  const claim = progress.chests[chest];
  return claim ? (claim.sequence ? claim.openedAt + EQUESTRIA_REFRESH_MS : 0) : Infinity;
}
