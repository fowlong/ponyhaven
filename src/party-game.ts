import type { ArcadeGame } from './desktop';

export const EQUESTRIA_PARTY_PROTOCOL = 1;
export interface EquestriaBuild {
  protocol: number;
  worldHash: string;
  gameplayHash: string;
}
export interface EquestriaPartyGame extends EquestriaBuild {
  game: 'equestria';
  session: string;
}
export interface ArcadePartyGame { game: ArcadeGame; map: number; pack?: string }
export type PartyGame = ArcadePartyGame | EquestriaPartyGame;

const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export function validEquestriaBuild(v: unknown): v is EquestriaBuild {
  if (!v || typeof v !== 'object') return false;
  const b = v as EquestriaBuild;
  return Number.isSafeInteger(b.protocol) && b.protocol > 0 && b.protocol <= 10000 && hash(b.worldHash) && hash(b.gameplayHash);
}

/** Copy only the recognized fields; peer-supplied objects never become launch options. */
export function readPartyGame(v: unknown): PartyGame | null {
  if (!v || typeof v !== 'object') return null;
  const g = v as Record<string, unknown>;
  if (g.game === 'equestria') {
    if (!validEquestriaBuild(g) || typeof g.session !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(g.session)) return null;
    return { game: 'equestria', session: g.session, protocol: g.protocol, worldHash: g.worldHash, gameplayHash: g.gameplayHash };
  }
  if ((g.game !== 'adventure' && g.game !== 'ponykart') || !Number.isInteger(g.map) || (g.map as number) < 1 || (g.map as number) > 1035 ||
      (g.pack !== undefined && !hash(g.pack))) return null;
  return { game: g.game, map: g.map as number, ...(g.pack ? { pack: g.pack as string } : {}) };
}

export function equestriaMismatch(host: EquestriaBuild, local: unknown): string | null {
  if (!validEquestriaBuild(local)) return 'Install the Equestria world and game files before joining.';
  if (host.protocol !== EQUESTRIA_PARTY_PROTOCOL || local.protocol !== host.protocol)
    return 'This Equestria session uses a different multiplayer version. Both players need the same Ponyhaven update.';
  if (local.worldHash !== host.worldHash) return 'Your Equestria map differs from the host’s. Install the same map edition before joining.';
  if (local.gameplayHash !== host.gameplayHash) return 'Your Equestria game files differ from the host’s. Both players need the same Ponyhaven update.';
  return null;
}
