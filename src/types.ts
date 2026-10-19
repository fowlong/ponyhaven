export interface Behavior {
  name: string;
  chance: number;
  min: number;
  max: number;
  speed: number;
  right: string;
  left: string;
  previewRight?: string;
  previewLeft?: string;
  movement: string;
  next: string | null;
  skip: boolean;
  followTarget?: string;
  targetX?: number;
  targetY?: number;
}
export interface PonyEffect {
  name: string;
  behavior: string;
  right: string;
  left: string;
  duration: number;
  repeat: number;
  placementRight: string;
  placementLeft: string;
  centeringRight: string;
  centeringLeft: string;
  follow: boolean;
}
export interface PonyInteraction {
  name: string;
  chance: number;
  proximity: number;
  targets: string[];
  activation: string;
  behaviors: string[];
  cooldown: number;
}
export interface Pony {
  id: string;
  name: string;
  folder: string;
  categories: string[];
  color: string;
  mane: boolean;
  unicorn: boolean;
  idle: string;
  walk: string;
  behaviors: Behavior[];
  speech: string[];
  effects?: PonyEffect[];
  interactions?: PonyInteraction[];
  starterCard?: string;
  preview?: string;
}
export interface Card {
  id: string;
  name: string;
  code: string;
  rarity: string;
  tier: number;
  sets: string[];
  membershipSource: string;
  ponyIds: string[];
  image: string;
  source: string;
}
export interface CardSet {
  id: string;
  name: string;
  family: string;
  edition: number | null;
  region: string;
  custom: boolean;
  price: number;
  color: string;
}
export interface Catalog {
  ponies: Pony[];
  cards: Card[];
  sets: CardSet[];
}
export interface PetChoice {
  ponyId: string;
  rarity: string;
  tier: number;
}
export interface PetStats {
  food: number;
  joy: number;
  energy: number;
  bond: number;
  wellbeing: number;
}
export interface PonyProgress {
  xp: number;
  stats: PetStats;
  statsAt: number;
  dirt: number;
  rewardedLevel: number;
}
export interface LevelReward {
  ponyId: string;
  level: number;
  cardId: string;
  petDrop: PetChoice | null;
}
export interface Background {
  id: string;
  name: string;
  file: string;
  source?: string;
  stage?: BackgroundStage;
}
export interface BackgroundStage {
  width: number;
  height: number;
  /** Foot line and standard pony height, as fractions of the source image height. */
  floor: number;
  ponyHeight: number;
  /** Clear horizontal walking lane in source-image coordinates. */
  walk: [number, number];
  focusX?: number;
}
export interface MeadowRoom {
  code: string;
  hostUid: string;
  hostName: string;
  background: string;
  customBackground: string;
  time: 'day' | 'night';
  updatedAt: number;
  expiresAt: number;
}
export interface Save {
  version: 1;
  name: string;
  createdAt: number;
  updatedAt: number;
  coins: number;
  collection: Record<string, number>;
  recentCards: string[];
  pet: PetChoice | null;
  starterId: string | null;
  lastPetChangeAt: number;
  casters: string[];
  caster: string;
  stats: PetStats;
  statsAt: number;
  xp: number;
  dirt: number;
  petUnlocks: PetChoice[];
  ponyProgress: Record<string, PonyProgress>;
  levelRewards: LevelReward[];
  dailyReward: string;
  purchases: Record<string, string[]>;
  totalLines: number;
  bestScore: number;
  openedPacks: number;
  pendingPack: { setId: string; cardIds: string[]; petDrops?: PetChoice[] } | null;
  journal: string[];
  careAt: number;
  friendshipAt: number;
  bathAt: number;
  npc: { ponyId: string; invitedAt: number; expiresAt: number } | null;
  npcCooldownUntil: number;
  arcade: ArcadeProgress;
}
export interface ArcadeRecord {
  bestScore: number;
  rings: number;
  bits: number;
  finishes: number;
  bestTimes: Record<string, number>;
}
export interface ArcadeProgress {
  adventure: ArcadeRecord;
  ponykart: ArcadeRecord;
  sessions: { id: string; game: 'adventure' | 'ponykart'; rings: number; laps: number; finished: boolean }[];
}
export interface Presence {
  uid: string;
  name: string;
  ponyId: string;
  rarity: string;
  tier: number;
  x: number;
  updatedAt: number;
  roomCode?: string;
  hostedRoom?: string;
}
