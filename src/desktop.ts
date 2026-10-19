export interface DesktopProfile { id: string; name: string; createdAt: number; cloudUid?: string | null }
export interface DesktopStatus { activated: boolean; profile: DesktopProfile | null; profiles: DesktopProfile[] }
export type ArcadeGame = 'adventure' | 'ponykart';
export interface ArcadeEvent {
  type: 'started' | 'progress' | 'ended' | 'error'; game: ArcadeGame;
  session: string; rings?: number; score?: number; map?: number; elapsed?: number;
  laps?: number; finished?: boolean; message?: string; pack?:string;
}
export interface LevelPack {id:string;name:string;extension:string;maps:{id:number;name:string}[];bytes:number}
export interface GameLaunch { game: ArcadeGame; pony: string; map: number; mode: 'solo' | 'host' | 'join'; port?: number; fullscreen: boolean; pastel?: number; pack?:string }
export interface DesktopAPI {
  status(): Promise<DesktopStatus>;
  activate(key: string, username: string): Promise<DesktopStatus>;
  load(): Promise<unknown>;
  save(save: unknown): Promise<void>;
  rename(name: string): Promise<DesktopStatus>;
  linkCloud(uid: string | null): Promise<DesktopStatus>;
  createProfile(name: string): Promise<DesktopStatus>;
  selectProfile(id: string): Promise<DesktopStatus>;
  backup(): Promise<void>;
  exportSave(save: unknown): Promise<boolean>;
  engines(): Promise<Record<ArcadeGame, boolean>>;
  levels(game: ArcadeGame): Promise<LevelPack[]>;
  importLevel(game: ArcadeGame): Promise<LevelPack[]>;
  removeLevel(game: ArcadeGame,id:string): Promise<LevelPack[]>;
  launch(options: GameLaunch): Promise<{ session: string; port: number }>;
  stopGame(): Promise<void>;
  onGame(callback: (event: ArcadeEvent) => void): () => void;
  relayOpen(options: { role: 'host' | 'guest'; id: string; port?: number }): Promise<number>;
  relaySend(id: string, bytes: number[]): Promise<void>;
  relayClose(id?: string): Promise<void>;
  onPacket(callback: (packet: { id: string; bytes: number[] }) => void): () => void;
  fullscreen(): Promise<boolean>;
}
declare global { interface Window { ponyDesktop?: DesktopAPI } }
export const desktop = window.ponyDesktop;
export let desktopProfile: DesktopStatus | null = null;
export async function refreshDesktop() {
  if (desktop) desktopProfile = await desktop.status();
  return desktopProfile;
}
