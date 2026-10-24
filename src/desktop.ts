export interface DesktopProfile { id: string; name: string; createdAt: number; cloudUid?: string | null }
export interface DesktopStatus { activated: boolean; profile: DesktopProfile | null; profiles: DesktopProfile[] }
export type ArcadeGame = 'adventure' | 'ponykart';
export interface ArcadeEvent {
  type: 'loading' | 'started' | 'progress' | 'ended' | 'error'; game: ArcadeGame;
  session: string; rings?: number; score?: number; map?: number; elapsed?: number;
  laps?: number; finished?: boolean; message?: string; pack?:string;
}
export interface LevelPack {id:string;name:string;extension:string;maps:{id:number;name:string}[];bytes:number}
export interface GameLaunch { game: ArcadeGame; pony: string; map: number; mode: 'solo' | 'host' | 'join'; port?: number; fullscreen: boolean; pastel?: number; pack?:string }
export interface DesktopAPI {
  status(): Promise<DesktopStatus>;
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
  equestriaStatus(): Promise<EquestriaStatus>;
  equestriaLaunch(options: EquestriaLaunch): Promise<{session:string;port:number;player:string;build:EquestriaBuild}>;
  equestriaInvite(peer:string,identity:EquestriaIdentity): Promise<EquestriaTicket>;
  equestriaRevoke(peer:string): Promise<void>;
  equestriaAck(player:string,state:EquestriaState): Promise<void>;
  equestriaInput(peer:string|null,book:number,session:string):Promise<void>;
  onEquestria(callback:(event:EquestriaEvent)=>void):()=>void;
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
import type { EquestriaProgress as EquestriaState } from './equestria-state';
import type { EquestriaBuild } from './party-game';
import type { EquestriaRewardEvent } from './equestria-rewards';

export interface EquestriaTicket { name: string; password: string }
export interface EquestriaIdentity { uid: string; displayName: string; pony: string; state: EquestriaState }
export interface EquestriaStatus { engine: boolean; world: boolean; title: string; build?: EquestriaBuild }
export interface EquestriaEvent { kind: 'loading'|'started'|'ended'|'error'|'reward'|'joined'|'input'|'notice'; session: string; player?: string; own?:boolean; event?: EquestriaRewardEvent; message?: string;book?:number }
export interface EquestriaLaunch { pony:string; saveId?:string; mode:'solo'|'host'|'join'; fullscreen:boolean; state:EquestriaState; port?:number; ticket?:EquestriaTicket; session?:string; build?:EquestriaBuild }
