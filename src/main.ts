import './style.css';
import './finishes.css';
import './meadow.css';
import './expansion.css';
import './backgrounds.css';
import './arcade.css';
import './sync.css';
import { desktop, desktopProfile, refreshDesktop, type ArcadeGame } from './desktop';
import { arcadeReward } from './arcade-progress';
import { renderArcade, renderLeaderboard, launchArcade, importLevel, removeLevel, setupArcade, setupScores, shareScores, running } from './arcade';
import { party } from './peer-party';
import { SharedMeadow, roomBackground } from './social';
import { sound } from './sound';
import { cardFinish, ponyFinish, finishNames } from './rarity';
import type { Background, Card, Catalog, PetChoice, Presence, Save } from './types';
import {
  awardXP,
  happiness,
  levelForXP,
  levelFloor,
  migrateProgress,
  syncProgress,
  activeNPC,
  inviteNPC,
  petChangeRemaining,
  buyCard,
  buyCaster,
  buyPack,
  care,
  cardPrice,
  changePet,
  chooseStarter,
  clamp,
  dailyGift,
  dailyShop,
  dayKey,
  decay,
  freshSave,
  journal,
  readSave,
  unlockedPets,
} from './game';
import { asset, Meadow, ponyImage, transformations } from './pet';
import { escape as e, icon } from './icons';
import {
  backgroundBlob,
  cloudConfigured,
  companion,
  getPreferences,
  accountLogin,
  prepareBackground,
  SaveStore,
  savePreferences,
} from './storage';
import { BLOCK_COLORS, drawGame, SHAPES, Tetris } from './tetris';

const app = document.querySelector<HTMLDivElement>('#app')!;
const modal = document.querySelector<HTMLDialogElement>('#modal')!;
const store = new SaveStore();
const views = companion ? ['home','shop','collection'] : ['home','shop','collection','blocks','adventure','ponykart','leaderboard'];
document.body.classList.toggle('companion', companion);
let catalog: Catalog,
  save: Save,
  view = 'home',
  prefs = getPreferences(),
  backgroundUrl: string | null = null;
let meadow: Meadow | null = null,
  game: Tetris | null = null,
  raf = 0,
  lastTick = 0,
  gameOverSaved = false;
let friends: Presence[] = [],
  unsubscribeFriends = () => {},
  selectedStarter = '';
let collectionMode = 'owned',
  search = '',
  series = '',
  rarity = '',
  page = 1,
  petOnly = false;
let collectionSort = 'recent';
let packIndex = -1,
  packRipped = false,
  toastTimer: ReturnType<typeof setTimeout> | undefined;
let uploadBusy = false;
let modalReturnFocus: HTMLElement | null = null;
let backgrounds: Background[] = [];
const social = new SharedMeadow();
sound.muted = prefs.quiet;
function chosenBackground() {
  const id = social.room?.background || prefs.background;
  return backgrounds.find((b) => b.id === id) || backgrounds[0];
}
function sceneImage() {
  if (social.room)
    return /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(social.room.customBackground)
      ? social.room.customBackground
      : asset(chosenBackground()?.file || 'assets/meadow.svg');
  return prefs.background === 'custom' && backgroundUrl
    ? backgroundUrl
    : asset(chosenBackground()?.file || 'assets/meadow.svg');
}
function sceneName() {
  return social.room?.customBackground || (!social.room && prefs.background === 'custom')
    ? 'Your custom view'
    : chosenBackground()?.name || 'Ponyville Meadow';
}
function sceneTime() {
  return social.room?.time || prefs.time;
}
async function shareBackground() {
  if (social.isHost)
    await social.background(
      prefs.background === 'custom'
        ? 'custom'
        : (backgrounds.find((b) => b.id === prefs.background) || backgrounds[0]).id,
      prefs.background === 'custom' ? await roomBackground(await backgroundBlob()) : '',
      prefs.time,
    );
}
function canChangeBackground() {
  if (social.room && !social.isHost) throw new Error('The host chooses the shared meadow’s background.');
}
async function cycleBackground(direction: number) {
  canChangeBackground();
  const index = Math.max(
    0,
    backgrounds.findIndex((b) => b.id === prefs.background),
  );
  prefs.background = backgrounds[(index + direction + backgrounds.length) % backgrounds.length].id;
  savePreferences(prefs);
  await shareBackground();
  render();
}
function notifyUnlocks(next: Save) {
  const added = next.petUnlocks.filter(
    (p) => !save.petUnlocks.some((q) => q.ponyId === p.ponyId && q.rarity === p.rarity),
  );
  const levels = next.levelRewards.length - save.levelRewards.length;
  if (added.length || levels > 0)
    queueMicrotask(() => {
      sound.play(added.length ? 'unlock' : 'reward');
      toast(
        [
          added.length
            ? `New virtual pet: ${added.map((p) => pony(p.ponyId).name + ' (' + p.rarity + ')').join(', ')}!`
            : '',
          levels > 0 ? 'Level up! A rare card gift is waiting.' : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
    });
}
function rewardDialog() {
  const reward = save.levelRewards[0];
  if (!reward) return;
  const card = cardById(reward.cardId)!;
  openModal(
    'A little milestone together',
    `<div class="single-reveal"><p class="eyebrow">${e(pony(reward.ponyId).name)} · LEVEL ${reward.level}</p><div class="reveal-card card-image rarity-${card.tier}"><img src="${cardImage(card)}" alt="${e(card.name)}"/>${cardFinish()}</div><span class="rarity-label tier-${card.tier}">${e(card.rarity)}</span><h2>${e(card.name)}</h2><p>A thank-you for growing together. Already saved in your binder.</p>${reward.petDrop ? `<p class="pet-drop-note">New virtual pet: ${e(pony(reward.petDrop.ponyId).name)}!</p>` : ''}<button class="button primary" data-action="claim-reward">${save.levelRewards.length > 1 ? 'See the next gift' : 'Lovely, thank you!'}</button></div>`,
  );
  sound.play('reward');
}

const pony = (id = save?.pet?.ponyId) => catalog.ponies.find((p) => p.id === id)!;
const cardById = (id: string) => catalog.cards.find((c) => c.id === id);
const bits = (n: number) => `${icon('coin')}<span>${n.toLocaleString()}</span>`;
const regionShort = (s: string) =>
  s === 'Chinese'
    ? 'CN'
    : s === 'North American English'
      ? 'EN · NA'
      : s === 'Overseas English'
        ? 'EN · Overseas'
        : 'Fan assortment';
const localStarters = new Set<string>();
const minutes = (ms: number) => `${Math.max(1, Math.ceil(ms / 60000))} min`;
function npcSummary() {
  const visitor = activeNPC(save);
  return visitor
    ? `${e(pony(visitor.ponyId).name)} is here for ${minutes(visitor.expiresAt - Date.now())}.`
    : save.npcCooldownUntil > Date.now()
      ? `Another visitor in ${minutes(save.npcCooldownUntil - Date.now())}.`
      : 'A random friend, a 20-minute playdate.';
}
function cardImage(c: Card, _width = 420) {
  return asset(`assets/cards/${c.id}.webp`);
}
function toast(message: string) {
  const el = document.querySelector<HTMLElement>('#toast')!;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
}
function commit(next: Save) {
  const added = Object.keys(next.collection).filter(id => next.collection[id] > (save.collection[id] || 0));
  if (added.length) next.recentCards = [...new Set([...added, ...next.recentCards])].slice(0, 100);
  if (next.bestScore !== save.bestScore) shareScores(next);
  next.updatedAt = Date.now();
  syncProgress(next);
  store.write(next);
  notifyUnlocks(next);
  save = next;
  updateHeader();
  if (view === 'collection') refreshCollection();
}
function updateHeader() {
  if (!save) return;
  document.querySelectorAll('[data-wallet]').forEach((el) => (el.textContent = save.coins.toLocaleString()));
  document.querySelectorAll('[data-sync]').forEach((el) => (el.textContent = store.status));
}
store.onStatus = () => {
  updateHeader();
  syncNotice();
  if (store.conflicted) {
    game && (game.paused = true);
    modal.close();
    toast(store.status);
  }
};
function syncNotice() {
  document.querySelector('#sync-notice')?.remove();
  if (!store.conflicted || !save) return;
  const notice=document.createElement('aside');notice.id='sync-notice';notice.className='sync-notice';notice.setAttribute('role','status');
  notice.innerHTML='<span>This profile changed on another device. Your device copy is backed up.</span><button class="button primary" data-action="reload-cloud">Load synced progress</button><button class="text-button" data-action="export-conflict">Export device backup</button>';
  app.prepend(notice);
}
store.onRemote = (remote) => {
  if (!catalog) return;
  save=migrateProgress(remote,catalog);
  if (game) { game.paused=true;game=null; }
  // A reveal/detail left open on this device may refer to an older snapshot.
  modal.close();
  if (save.pet) render(); else renderWelcome();
  if (!document.hidden) toast('Your latest progress has arrived.');
};
function openModal(title: string, body: string, wide = false) {
  if (!modal.open) modalReturnFocus = document.activeElement as HTMLElement;
  if (game?.started) game.paused = true;
  modal.className = wide ? 'wide' : '';
  modal.innerHTML = `<div class="modal-head"><h2>${title}</h2><button class="icon-button" data-action="close" aria-label="Close dialog">${icon('close')}</button></div>${body}`;
  if (!modal.open) modal.showModal();
}
function header() {
  return `<header class="site-header"><a class="brand" href="#home" data-nav="home"><span class="brand-mark">${icon('spark')}</span><span>ponyhaven<small>A LITTLE MAGIC, EVERY DAY</small></span></a><nav aria-label="Main navigation">${[
    ['home', 'home', 'Meadow'],
    ['blocks', 'blocks', 'Magic Blocks'],
    ['adventure', 'compass', 'Adventure'],
    ['ponykart', 'flag', 'Ponykart'],
    ['shop', 'shop', 'Little shop'],
    ['collection', 'cards', 'Collection'],
    ['leaderboard', 'trophy', 'Leaderboard'],
  ]
    .filter(([id]) => views.includes(id))
    .map(
      ([id, ic, label]) =>
        `<button class="nav-item ${view === id ? 'active' : ''}" data-nav="${id}" ${view === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></button>`,
    )
    .join(
      '',
    )}</nav><div class="header-actions"><div class="wallet" aria-label="${save.coins} bits">${icon('coin')}<span data-wallet>${save.coins.toLocaleString()}</span><small>bits</small></div><button class="avatar" data-action="settings" aria-label="Account and settings">${e(save.name[0] || 'F')}</button></div></header>`;
}
function footer() {
  return `<footer class="site-footer"><span>${icon('heart')} A little fan-made corner of Equestria. Always free.</span><button data-action="credits">Credits & sources</button><span class="sync-status" data-sync>${e(store.status)}</span></footer>`;
}
function title(eyebrow: string, name: string, description: string, aside = '') {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${name}</h1><p class="subheading">${description}</p></div>${aside}</div>`;
}
function render() {
  meadow?.destroy();
  meadow = null;
  cancelAnimationFrame(raf);
  document.body.classList.toggle('reduced-motion', prefs.reducedMotion);
  document.body.classList.toggle('blocks-view', view === 'blocks');
  app.innerHTML =
    header() +
    `<main id="main" tabindex="-1">${view === 'home' ? renderHome() : view === 'shop' ? renderShop() : view === 'collection' ? renderCollection() : view === 'adventure' || view === 'ponykart' ? renderArcade(view, catalog, save) : view === 'leaderboard' ? renderLeaderboard(save) : renderBlocks()}</main>` +
    footer();
  if (view === 'home') mountHome();
  if (view === 'blocks') mountGame();
  countdown();
  refreshInvitation();
  syncNotice();
}
function renderWelcome() {
  const mane = ['twilight-sparkle', 'pinkie-pie', 'rainbow-dash', 'fluttershy', 'rarity', 'applejack'].map(
    (id) => pony(id),
  );
  app.innerHTML = `<header class="welcome-header"><a class="brand" href="#">${icon('spark')} ponyhaven</a><div>${desktop?'<button class="text-button" data-action="profiles">Local profiles</button>':''}<button class="text-button" data-action="credits">A fan-made little world ${icon('heart')}</button></div></header><main class="welcome" id="main"><p class="eyebrow">YOUR VERY OWN CORNER OF EQUESTRIA</p><h1>Every adventure starts<br>with a <em>friend.</em></h1><p>Pick your first pony. A cozy meadow, a collection of little treasures,<br class="desktop-only"> and a whole lot of friendship are waiting.</p><div class="starter-grid" role="group" aria-label="Choose your first pony">${mane
    .map((p) => {
      const c = cardById(p.starterCard!)!;
      return `<button class="starter ${selectedStarter === p.id ? 'selected' : ''}" data-starter="${p.id}" aria-pressed="${selectedStarter === p.id}" style="--pony-color:${p.color}"><div class="starter-art"><img src="${cardImage(c)}" alt="${e(p.name)} Kayou ${c.rarity} card"/><span class="starter-check">${icon('check')}</span></div><strong>${e(p.name)}</strong><small>${{ 'twilight-sparkle': 'A little magic', 'pinkie-pie': 'A little laughter', 'rainbow-dash': 'A little adventure', fluttershy: 'A little kindness', rarity: 'A little sparkle', applejack: 'A little sunshine' }[p.id]}</small></button>`;
    })
    .join(
      '',
    )}</div><button class="button primary begin-button" data-action="begin" ${selectedStarter ? '' : 'disabled'}>${selectedStarter ? `Meet ${e(pony(selectedStarter).name)}` : 'Choose your first friend'} ${icon('arrow')}</button><p class="welcome-note">${icon('gift')} ${save.coins} welcome bits · Your first card is included · Unlock more friends as you collect</p><p class="save-note">${desktop ? 'Progress saves to your local profile. Export a backup in settings.' : cloudConfigured ? 'Your progress is saved to your invited account.' : 'Local play · Progress saves in this browser. You can export a backup in settings.'}</p></main>${footer()}`;
}
function renderHome() {
  const p = pony(),
    stats = decay(save).stats,
    level = levelForXP(save.xp);
  const date = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(
    new Date(),
  );
  const recent = Object.keys(save.collection)
    .slice(-4)
    .reverse()
    .map((id) => cardById(id))
    .filter(Boolean) as Card[];
  return (
    title(
      'YOUR HAPPY LITTLE PLACE',
      `Make yourself at home<span class="heading-spark">✧</span>`,
      `A little care. A little play. A little closer, every day.`,
      `<div class="date-note">${icon('sun')}<span>${date}<small>It’s a lovely day for friendship.</small></span></div>`,
    ) +
    `
  <div class="home-layout"><section class="meadow-card" aria-label="Your pony’s meadow"><div class="meadow-scene ${sceneTime() === 'night' ? 'night' : ''} ${sceneImage() !== asset('assets/meadow.svg') ? 'custom-background' : ''}" id="meadow-scene" style="background-image:url('${sceneImage()}')"><div class="scene-top"><span class="scene-label">${icon('leaf')} ${e(sceneName())} <i></i></span><div class="scene-tools"><button class="glass-button" data-action="time" aria-label="Switch to ${prefs.time === 'day' ? 'night' : 'day'}">${icon(prefs.time === 'day' ? 'sun' : 'moon')}</button><button class="glass-button" data-action="background" aria-label="Customize meadow background">${icon('image')}</button></div></div><div class="scene-cloud cloud-one"></div><div class="scene-cloud cloud-two"></div><span class="floating-spark spark-one">✧</span><span class="floating-spark spark-two">✦</span><div class="background-arrows"><button data-action="previous-background" aria-label="Previous background" ${social.room && !social.isHost ? 'disabled' : ''}>‹</button><button data-action="next-background" aria-label="Next background" ${social.room && !social.isHost ? 'disabled' : ''}>›</button></div><div id="friend-sprites"></div><button id="pet-wrap" class="pet-wrap rarity-${save.pet!.tier}" data-care="pet" style="--aura:${p.color};left:45%" aria-label="Pet ${e(p.name)}"><span class="pet-bubble" id="pet-bubble">Friendship looks good on us. ♡</span>${ponyFinish()}<img id="pet-sprite" src="${ponyImage(p, prefs.reducedMotion)}" alt="${e(p.name)}"/><span class="pet-name">${e(p.name)} ${icon('heart')}</span></button><div class="scene-bottom"><span>${icon('users')} <span id="meadow-presence-label">Your own little haven</span></span><span class="scene-hint">Click the grass to explore</span></div></div><div class="care-bar"><div class="care-intro"><span class="mini-heart">${icon('heart')}</span><div><strong>A little love goes a long way.</strong><span>What shall we do together?</span></div></div><div class="care-actions"><button data-care="brush">${icon('brush')}<span>Brush</span><small>Clean coat</small></button><button data-action="bath">${icon('bath')}<span>Bath</span><small>Wash & sparkle</small></button><button data-care="feed">${icon('apple')}<span>Feed</span><small>Free treats</small></button><button data-care="play">${icon('smile')}<span>Play</span><small>Happy hooves</small></button><button data-care="rest">${icon('moon')}<span>Rest</span><small>Cozy time</small></button><button data-care="transform" ${transformations(p).length ? '' : 'disabled'} title="${transformations(p).length ? 'A random 10-second transformation or outfit' : 'No transformation in this pony’s sprite set'}">${icon('spark')}<span>Transformation</span><small>10-second magic</small></button></div></div></section>
  <aside class="pet-panel"><div class="pet-panel-heading"><p class="eyebrow">YOUR LITTLE COMPANION</p><button class="icon-button" data-action="pets" aria-label="Choose a different pony">${icon('rotate')}</button></div><div class="pet-profile"><div class="portrait" style="--pony-color:${p.color}"><img src="${ponyImage(p, true)}" alt=""/></div><div><h2>${e(p.name)}</h2><span class="rarity-label tier-${save.pet!.tier}">✧ ${e(save.pet!.rarity)} companion</span></div></div><div class="level-line"><span>Level <b id="current-level">${level}</b> · ${level < 5 ? 'Growing together' : 'The best of friends'}</span><span id="pet-xp">${save.xp - levelFloor(level)}/${levelFloor(level + 1) - levelFloor(level)} XP</span></div><div class="xp-track"><i style="width:${((save.xp - levelFloor(level)) / (levelFloor(level + 1) - levelFloor(level))) * 100}%"></i></div><div class="needs">${stat('food', 'Full tummy', 'apple', stats.food)}${stat('happiness', 'Happiness', 'smile', happiness({ ...save, stats }))}${stat('energy', 'Energy', 'moon', stats.energy)}${stat('wellbeing', 'Wellbeing', 'bath', stats.wellbeing)}${stat('bond', 'Friendship', 'heart', stats.bond)}</div><p class="pet-mood" id="pet-mood">${icon('leaf')} ${stats.food > 65 && stats.joy > 65 ? 'Feeling right at home.' : 'A little company would be lovely.'}</p><button class="button secondary full" data-action="pets">Meet your other ponies ${icon('arrow')}</button><small class="daily-note" data-pet-cooldown>Switch ponies freely · Every pony keeps their own level</small><button class="button secondary full reward-nudge" data-action="rewards" ${save.levelRewards.length ? '' : 'hidden'}>${icon('gift')} Level-up gift waiting</button></aside></div>
  <div class="home-lower"><section class="small-panel gift-panel"><div class="gift-art">${icon('gift')}</div><div><p class="eyebrow">A LITTLE SOMETHING FOR YOU</p><h3>Your daily pocketful of joy</h3><p>150 bits, just for stopping by.</p></div><button class="button secondary" data-action="gift" ${save.dailyReward === dayKey() ? 'disabled' : ''}>${save.dailyReward === dayKey() ? 'All yours today' : `Collect ${icon('coin')} 150`}</button></section><section class="small-panel friendship-panel"><span class="friendship-icon">${icon('users')}</span><div><h3>A little company</h3><p id="npc-status">${npcSummary()}</p><button class="button secondary invite-button" data-action="invite-npc" ${save.npcCooldownUntil > Date.now() ? 'disabled' : ''}>${icon('users')} ${save.npcCooldownUntil > Date.now() ? 'Visitor invited' : 'Invite a friend'}</button><p id="friend-status">${cloudConfigured ? 'Your friends will appear here when they visit.' : 'Your shared meadow awaits account setup.'}</p><button class="text-button" data-action="friends">Our shared meadow ${icon('arrow')}</button></div></section></div>
  <div class="home-bottom"><section class="recent-section"><div class="section-heading"><h2>Little treasures</h2><button class="text-button" data-nav="collection">Open your binder ${icon('arrow')}</button></div><div class="recent-cards">${recent.map((c) => `<button class="recent-card" data-card="${c.id}"><div class="recent-art card-image rarity-${c.tier}"><img src="${cardImage(c, 220)}" alt="${e(c.name)} ${c.rarity}"/>${cardFinish()}</div><div><span class="rarity-label tier-${c.tier}">${e(c.rarity)}</span><strong>${e(c.name)}</strong><small>${e(c.code)}</small></div></button>`).join('')}<button class="discover-card" data-nav="shop">${icon('spark')}<strong>Find your next favorite</strong><span>A little surprise is waiting in the shop.</span>${icon('arrow')}</button></div></section><section class="journal"><p class="eyebrow">PAGES FROM YOUR DAY</p><h3>Dear friendship diary…</h3>${save.journal
    .slice(0, 2)
    .map((j) => `<p>${icon('heart')}<span>${e(j)}</span></p>`)
    .join('')}</section></div>`
  );
}
function stat(id: string, label: string, ic: string, n: number) {
  return `<div class="need need-${id}"><div><span>${icon(ic)}${label}</span><strong data-stat-label="${id}">${Math.round(n)}<small>/100</small></strong></div><div class="stat-track" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(n)}" data-stat="${id}"><i style="width:${n}%"></i></div></div>`;
}
function mountHome() {
  if (social.room) {
    const other = activeFriends().find((f) => f.roomCode === social.code);
    document.querySelector<HTMLElement>('#pet-wrap')!.style.left =
      (other ? (other.x < 50 ? 65 : 35) : 35) + '%';
  }
  meadow = new Meadow(
    document.querySelector('#meadow-scene')!,
    pony(),
    catalog.ponies,
    prefs.reducedMotion,
    () => save.dirt,
    () => {
      try {
        commit(awardXP(care(save, 'bath'), 1, catalog));
        refreshStats();
        sound.play('bath');
      } catch {}
    },
    social.room?.customBackground || (!social.room && prefs.background === 'custom')
      ? undefined
      : chosenBackground()?.stage,
  );
  refreshFriends();
  document.querySelector('#meadow-scene')!.addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).closest('button') || meadow?.isBathing()) return;
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    meadow?.move((((ev as MouseEvent).clientX - rect.left) / rect.width) * 100);
  });
}
function refreshStats() {
  const current = decay(save),
    stats = { ...current.stats, happiness: happiness(current) };
  for (const [key, value] of Object.entries(stats)) {
    const bar = document.querySelector<HTMLElement>(`[data-stat="${key}"]`);
    if (bar) {
      bar.setAttribute('aria-valuenow', String(Math.round(value)));
      bar.querySelector<HTMLElement>('i')!.style.width = `${value}%`;
    }
    const label = document.querySelector(`[data-stat-label="${key}"]`);
    if (label) label.innerHTML = `${Math.round(value)}<small>/100</small>`;
  }
  const level = levelForXP(save.xp),
    floor = levelFloor(level),
    needed = levelFloor(level + 1) - floor;
  const levelText = document.querySelector('#current-level');
  if (levelText) levelText.textContent = String(level);
  const xp = document.querySelector('#pet-xp');
  if (xp) xp.textContent = `${save.xp - floor}/${needed} XP`;
  const track = document.querySelector<HTMLElement>('.xp-track i');
  if (track) track.style.width = `${((save.xp - floor) / needed) * 100}%`;
  const gift = document.querySelector<HTMLButtonElement>('.reward-nudge');
  if (gift) gift.hidden = !save.levelRewards.length;
}
function packArt(setId: string, small = false) {
  const set = catalog.sets.find((s) => s.id === setId)!;
  return `<div class="pack-art ${small ? 'small' : ''}" style="--pack-color:${set.color}"><div class="pack-crimp"></div><div class="pack-star">${icon(set.family === 'Moon' ? 'moon' : set.family === 'Rainbow' ? 'sun' : 'spark')}</div><span class="pack-brand">MY LITTLE PONY</span><strong>${e(set.name)}</strong><span class="pack-sub">A POCKETFUL OF MAGIC</span><div class="pack-ponies">${catalog.ponies
    .filter((p) => p.mane)
    .slice(0, 3)
    .map((p) => `<img src="${ponyImage(p, true)}" alt=""/>`)
    .join(
      '',
    )}</div><span class="pack-count">5 collectible cards · digital fan pack</span><div class="pack-crimp bottom"></div></div>`;
}
function renderShop() {
  const shop = dailyShop(catalog);
  return (
    title(
      'SOMETHING WONDERFUL IS WAITING',
      'The little shop',
      'Earn bits, find treasures, and bring a little more magic home.',
      `<div class="refresh-badge">${icon('clock')}<span>Fresh finds in <strong data-countdown></strong><small>Same little shop for every friend · 00:00 UTC</small></span></div>`,
    ) +
    `${save.pendingPack ? `<button class="pending-banner" data-action="resume-pack">${icon('gift')} You have a pack waiting to be opened ${icon('arrow')}</button>` : ''}<section><div class="section-heading"><h2>A little surprise, just for you</h2><span>Two packs · Five cards in each</span></div><div class="pack-grid">${shop.packs.map((set) => `<article class="pack-product" style="--pack-color:${set.color}">${packArt(set.id)}<div class="pack-details"><span class="eyebrow">${set.custom ? 'FAN-MADE ASSORTMENT' : `${e(set.family)} COLLECTION`} · ${regionShort(set.region)}</span><h3>${e(set.name)}</h3><p>${set.custom ? 'A home for special cards without a confirmed regular pack.' : 'Five cards from this series, including one tier 3+ card when the set has one.'}</p><span class="pack-pool">${catalog.cards.filter((c) => c.sets.includes(set.id)).length} possible cards · Duplicates possible</span><button class="button primary" data-pack="${set.id}" ${save.coins < set.price || save.pendingPack ? 'disabled' : ''}>Open a little magic <span class="button-price">${bits(set.price)}</span></button><button class="text-button" data-pool="${set.id}">Explore this pack ${icon('arrow')}</button></div></article>`).join('')}</div></section><section class="shop-section"><div class="section-heading"><div><p class="eyebrow">TODAY’S SPECIAL FINDS</p><h2>A few rare beauties</h2></div><span>Five unique cards · One of each per day</span></div><div class="shop-card-grid">${shop.singles.map((c) => `<article class="shop-card">${cardTile(c, false)}<button class="button secondary full" data-buy-card="${c.id}" ${save.coins < cardPrice(c) || save.purchases[dayKey()]?.includes(c.id) ? 'disabled' : ''}>${save.purchases[dayKey()]?.includes(c.id) ? `${icon('check')} Collected today` : bits(cardPrice(c))}</button></article>`).join('')}</div></section><section class="shop-section"><div class="section-heading"><div><p class="eyebrow">A LITTLE HELP WITH THE MAGIC</p><h2>Meet your magic companions</h2></div><span>Unicorns for Magic Blocks · 120 bits each</span></div><div class="caster-grid">${shop.casters.map((p) => `<article class="caster-card" style="--aura:${p.color}"><div class="caster-portrait"><img src="${ponyImage(p, prefs.reducedMotion)}" alt="${e(p.name)}"/></div><div><h3>${e(p.name)}</h3><p><span class="color-dot" style="background:${p.color}"></span> ${p.color.toUpperCase()} magic aura</p><small>Magic Blocks companion</small></div><button class="button secondary" data-buy-caster="${p.id}" ${save.casters.includes(p.id) || save.coins < 120 ? 'disabled' : ''}>${save.casters.includes(p.id) ? icon('check') + ' Yours' : bits(120)}</button></article>`).join('')}</div></section><p class="fine-print">Every bit is earned in game. Digital fan packs have custom game odds and do not reproduce physical Kayou pack odds.</p>`
  );
}
function cardTile(c: Card, owned = true) {
  return `<button class="card-tile" data-card="${c.id}"><div class="card-image rarity-${c.tier}"><img loading="lazy" src="${cardImage(c)}" alt="${e(c.name)} · ${e(c.code)}"/>${owned && save.collection[c.id] > 1 ? `<span class="duplicate-count">×${save.collection[c.id]}</span>` : ''}${cardFinish()}</div><div class="card-meta"><strong>${e(c.name)}</strong><div><span class="rarity-label tier-${c.tier}">${e(c.rarity)}</span><span class="pet-included" title="Includes virtual pet: ${c.ponyIds.length ? 'Yes' : 'No'}">${icon(c.ponyIds.length ? 'heart' : 'cards')}${c.ponyIds.length ? 'Pet possible' : 'Card only'}</span></div><small>${e(c.code)}</small></div></button>`;
}
function filteredCards() {
  const recent = new Map(save.recentCards.map((id, index) => [id, index]));
  return catalog.cards
    .filter(
      (c) =>
        (collectionMode !== 'owned' || save.collection[c.id]) &&
        (!search || `${c.name} ${c.code}`.toLowerCase().includes(search.toLowerCase())) &&
        (!series || c.sets.includes(series)) &&
        (!rarity || c.rarity === rarity) &&
        (!petOnly || c.ponyIds.length),
    )
    .sort((a, b) => (collectionSort === 'recent' && collectionMode === 'owned' ? (recent.get(a.id) ?? 999) - (recent.get(b.id) ?? 999) : 0) || b.tier - a.tier || a.name.localeCompare(b.name));
}
function resetCollectionFilters() {
  collectionMode = 'owned'; search = series = rarity = ''; petOnly = false; page = 1;
}
function refreshCollection() {
  if (!document.querySelector('#collection-results')) return;
  const cards = filteredCards();
  page = Math.min(page, Math.max(1, Math.ceil(cards.length / 36)));
  document.querySelector('#collection-results')!.innerHTML = collectionResults(cards);
  document.querySelector('#results-label')!.textContent = `${cards.length.toLocaleString()} little treasures`;
  const count = document.querySelector('.collection-count');
  if (count) count.innerHTML = `<strong>${Object.keys(save.collection).filter(id => cardById(id)).length}<span> / ${catalog.cards.length.toLocaleString()}</span></strong><small>unique cards &middot; ${Object.values(save.collection).reduce((a,b) => a+b,0)} cards in your binder</small>`;
}
function renderCollection() {
  const cards = filteredCards(),
    owned = Object.keys(save.collection).filter((id) => cardById(id)).length,
    total = Object.values(save.collection).reduce((a, b) => a + b, 0);
  page = Math.min(page, Math.max(1, Math.ceil(cards.length / 36)));
  return (
    title(
      'YOUR VERY OWN TREASURE TROVE',
      'The friendship collection',
      'Every card has a story. Every friend is a little bit of magic.',
      `<div class="collection-count"><strong>${owned.toLocaleString()}<span> / ${catalog.cards.length.toLocaleString()}</span></strong><small>unique cards · ${total} cards in your binder</small></div>`,
    ) +
    `<div class="collection-toolbar"><div class="segmented" role="group" aria-label="Collection view"><button data-collection-mode="owned" class="${collectionMode === 'owned' ? 'active' : ''}">My collection</button><button data-collection-mode="all" class="${collectionMode === 'all' ? 'active' : ''}">All cards</button></div><div class="search-input">${icon('search')}<input type="search" id="card-search" placeholder="Find a pony or card number…" value="${e(search)}" aria-label="Search cards"/></div><select id="series-filter" aria-label="Filter by pack series"><option value="">Every series</option>${catalog.sets.map((s) => `<option value="${s.id}" ${series === s.id ? 'selected' : ''}>${e(s.name)} · ${regionShort(s.region)}</option>`).join('')}</select><select id="rarity-filter" aria-label="Filter by rarity"><option value="">Every rarity</option>${[
      ...new Set(catalog.cards.map((c) => c.rarity)),
    ]
      .sort()
      .map((r) => `<option ${rarity === r ? 'selected' : ''}>${e(r)}</option>`)
      .join(
        '',
      )}</select></div><div class="collection-summary"><span id="results-label">${cards.length.toLocaleString()} little treasures${series ? ' in this series' : ''}</span><label class="checkbox-label"><input type="checkbox" id="pet-filter" ${petOnly ? 'checked' : ''}/> Includes a virtual pet</label></div><div id="collection-results">${collectionResults(cards)}</div>`
  );
}
function collectionResults(cards: Card[]) {
  return cards.length
    ? `<div class="collection-grid">${cards
        .slice((page - 1) * 36, page * 36)
        .map(
          (c) =>
            `<div class="collection-card ${!save.collection[c.id] ? 'unowned' : ''}">${cardTile(c)}${collectionMode === 'all' ? `<span class="ownership">${save.collection[c.id] ? `${icon('check')} In your binder` : 'Not collected yet'}</span>` : ''}</div>`,
        )
        .join(
          '',
        )}</div><div class="pagination"><button class="button secondary" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${Math.ceil(cards.length / 36)}</span><button class="button secondary" data-page="${page + 1}" ${page * 36 >= cards.length ? 'disabled' : ''}>Next ${icon('arrow')}</button></div>`
    : `<div class="empty-state">${icon('cards')}<h2>${search || series || rarity || petOnly ? 'No matching treasures yet' : 'Your next favorite is waiting'}</h2><p>${search || series || rarity || petOnly ? 'Try another name, rarity, or series.' : 'Open a pack in the little shop to grow your collection.'}</p><button class="button secondary" data-action="${search || series || rarity || petOnly ? 'clear-filters' : 'shop'}">${search || series || rarity || petOnly ? 'Clear filters' : 'Visit the little shop'}</button></div>`;
}
function updateCollection() {
  const list = filteredCards();
  page = 1;
  document.querySelector('#collection-results')!.innerHTML = collectionResults(list);
  document.querySelector('#results-label')!.textContent = `${list.length.toLocaleString()} little treasures`;
}
function detail(c: Card) {
  const setNames = c.sets.map((id) => catalog.sets.find((s) => s.id === id)).filter(Boolean);
  openModal(
    'A little closer look',
    `<div class="card-detail"><div class="detail-art card-image rarity-${c.tier}"><img src="${cardImage(c, 1000)}" alt="${e(c.name)} ${e(c.code)}"/>${cardFinish()}</div><div class="detail-text"><span class="rarity-label tier-${c.tier}">${e(c.rarity)} · Tier ${c.tier}</span><h2>${e(c.name)}</h2><p class="finish-note">${e(finishNames[c.tier])} finish</p><p class="code">${e(c.code)}</p><dl><dt>In your collection</dt><dd>${save.collection[c.id] || 0} copies</dd><dt>Includes virtual pet</dt><dd class="${c.ponyIds.length ? 'yes' : 'muted'}">${icon(c.ponyIds.length ? 'check' : 'cards')}${c.ponyIds.length ? 'Yes' : 'No'}</dd></dl>${
      c.ponyIds.length
        ? `<div class="unlock-preview">${c.ponyIds
            .map((id) => {
              const p = pony(id);
              return `<span class="pet-preview rarity-${c.tier}" style="--aura:${p.color}">${ponyFinish()}<img src="${ponyImage(p, true)}" alt="${e(p.name)}"/></span>`;
            })
            .join(
              '',
            )}<p>${c.ponyIds.map((id) => e(pony(id).name)).join(', ')}<small>${e(c.rarity)} companion variant · ${c.tier >= 6 ? 'Guaranteed pet drop when received' : '20% bonus pet roll per pack'}</small></p></div>`
        : ''
    }<h4>Found in</h4><div class="set-chips">${setNames.map((s) => `<button data-pool="${s!.id}">${e(s!.name)} · ${regionShort(s!.region)}</button>`).join('')}</div>${c.membershipSource === 'fan-made fallback' ? '<p class="fine-print">No confirmed regular pack: included in our fan-made Friendship Specials assortment.</p>' : ''}<a class="text-link" href="${e(c.source)}" target="_blank" rel="noopener noreferrer">View original card listing ↗</a></div></div>`,
    true,
  );
}
function petPicker() {
  const pets = unlockedPets(save, catalog.cards).sort(
    (a, b) => pony(a.ponyId).name.localeCompare(pony(b.ponyId).name) || b.tier - a.tier,
  );
  openModal(
    'A meadow full of friends',
    `<p class="modal-intro">Find a pet drop in a pack to invite its pony. Different rarities add a little sparkle to the same friend. Switch freely. Each pony keeps their own care, level, and gifts across rarity variants.</p><div class="pet-picker">${pets
      .map((p) => {
        const info = pony(p.ponyId);
        const active = save.pet?.ponyId === p.ponyId && save.pet.rarity === p.rarity;
        return `<button data-pet="${p.ponyId}" data-pet-rarity="${e(p.rarity)}" class="pet-option ${active ? 'selected' : ''}" ${active ? 'disabled' : ''}><span class="pet-preview rarity-${p.tier}" style="--aura:${info.color}">${ponyFinish()}<img src="${ponyImage(info, true)}" alt=""/></span><strong>${e(info.name)}</strong><small>Level ${levelForXP(save.ponyProgress[p.ponyId]?.xp || 0)}</small><span class="rarity-label tier-${p.tier}">${e(p.rarity)} ${active ? '· With you' : ''}</span></button>`;
      })
      .join(
        '',
      )}</div><p class="fine-print">${new Set(pets.map((p) => p.ponyId)).size} of ${catalog.ponies.length} characters unlocked. Some characters have no matching card in the current source catalog.</p>`,
    true,
  );
}
function settings() {
  openModal(
    'Your little preferences',
    `<div class="settings-body"><div class="account-summary"><span class="avatar">${e(save.name[0])}</span><div><strong>${e(save.name)}</strong><p>${desktop ? 'Activated invitation &middot; Local profile' : cloudConfigured ? 'Invited account' : 'Local play on this browser'}</p><small>${e(store.status)}</small></div></div><label class="field-label" for="display-name">What should your friends call you?</label><div class="input-row"><input id="display-name" maxlength="24" value="${e(save.name)}"/><button class="button secondary" data-action="save-name">Save</button></div><label class="setting-toggle"><span><strong>Gentle motion</strong><small>Still pony previews and quieter visual effects.</small></span><input type="checkbox" id="motion-setting" ${prefs.reducedMotion ? 'checked' : ''}/></label><label class="setting-toggle"><span><strong>Game sounds</strong><small>Soft sounds for care, magic, and little discoveries.</small></span><input type="checkbox" id="sound-setting" ${prefs.quiet ? '' : 'checked'}/></label><div class="setting-row"><span><strong>Make the meadow yours</strong><small>Upload a background, or return to Ponyville.</small></span><button class="icon-button" data-action="background" aria-label="Change background">${icon('image')}</button></div><div class="settings-buttons"><button class="button secondary" data-action="export">${icon('download')} Export save</button><label class="button secondary">${icon('upload')} Import save<input class="sr-only" type="file" id="import-save" accept="application/json"/></label></div><p class="fine-print">${desktop ? 'Progress saves in your local profile. Export a backup to move computers. Each profile has its own progress and meadow preferences; resetting progress keeps your activation.' : cloudConfigured ? 'Cloud saves sync between your devices. Backgrounds and motion preferences stay on this device.' : 'Your game saves automatically in this browser. Export a backup before clearing browser data or moving devices. Account sign-in and the shared meadow become available when the owner connects the free backend.'}</p>${desktop ? '<button class="button secondary full" data-action="profiles">Manage local profiles</button>' : ''}<button class="text-button danger" data-action="reset-account">Start this profile again</button>${cloudConfigured ? '<button class="text-button" data-action="logout">Sign out</button>' : ''}</div>`,
  );
  if (desktop) {
    const body=modal.querySelector('.settings-body')!;
    body.insertAdjacentHTML('beforeend', `<div class="sync-settings"><h3>Take your meadow with you</h3><p>${store.linked ? 'This profile is linked to your mobile account. Cards, bits and pony progress sync automatically.' : 'Link an invited account to use the same pets, shop and collection on your phone.'}</p><button class="button secondary full" data-action="sync-account" ${cloudConfigured?'':'disabled'}>${store.linked?'Reconnect sync account':'Connect mobile sync'}</button>${store.linked?'<button class="text-button" data-action="disconnect-sync">Disconnect this local profile</button>':''}${cloudConfigured?'':'<p class="fine-print">Your host needs to add the Firebase settings described in MOBILE_SYNC_SETUP.md.</p>'}</div>`);
    modal.querySelector('[data-action="logout"]')?.remove();
  }
}
function syncDialog() {
  openModal('A meadow on every screen', `<p class="modal-intro">Use the invited account your host created. If it already has progress, that progress will load here. A backup of this local profile is kept first.</p><form id="sync-form"><label class="field-label" for="sync-account">Username or email</label><input id="sync-account" autocomplete="username" required/><label class="field-label" for="sync-password">Password</label><input id="sync-password" type="password" autocomplete="current-password" required/><button class="button primary full" data-action="connect-sync" type="submit">Connect this profile</button></form>`);
}
function backgroundSettings() {
  openModal(
    'A place that feels like you',
    `<div class="background-preview" style="background-image:url('${sceneImage()}')"></div><p class="modal-intro">Use the meadow arrows to explore ${backgrounds.length} built-in views, or bring your own view. Your background is saved on this device.</p><label class="upload-zone">${icon('upload')}<strong>Choose a background image</strong><span>JPG, PNG, or WebP · up to 12 MB</span><input class="sr-only" id="background-upload" type="file" accept="image/jpeg,image/png,image/webp"/></label><button class="button secondary full" data-action="restore-background" ${!backgroundUrl ? 'disabled' : ''}>${icon('leaf')} Restore the default meadow</button>`,
  );
}
function credits() {
  openModal(
    'Made with a little friendship',
    `<div class="prose"><p>Ponyhaven is a free, personal fan game. Bits have no real-money value. This is not an official Hasbro or Kayou product.</p><h3>Pony artwork</h3><p>All ${catalog?.ponies.length || 311} characters and their animations come from <a href="https://github.com/RoosterDragon/Desktop-Ponies" target="_blank" rel="noopener">Desktop Ponies</a>, by its many contributing artists, under <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank" rel="noopener">CC BY-NC-SA 3.0</a>. <a href="${asset('data/desktop-ponies-credits.txt')}" target="_blank">Read the complete artist credits</a>.</p><h3>Backgrounds & sounds</h3><p>Location backgrounds are from your PonyPonyParadise copy, alongside the original Ponyhaven meadow. Only scenery is included. Sound effects are synthesized for this game.</p><h3>Kayou card catalog</h3><p>Card imagery and metadata are sourced from <a href="https://mylittlecardcollection.com/collections/all-singles" target="_blank" rel="noopener">My Little Card Collection</a>. Pack families use its <a href="https://mylittlecardcollection.com/pages/free-downloadable-kayou-mlp-guide-checklist" target="_blank" rel="noopener">Kayou guide and checklists</a>, source tags, and marked code-based inferences. Playable card-game sets are excluded.</p><p>Source images, including any existing watermarks, are preserved. Card art remains the property of its respective owners. The catalog is a dated snapshot, not a claim of every card ever released.</p><h3>A little transparency</h3><p>Pet drops: one 20% bonus roll per pack from eligible cards, plus guaranteed matching pets from tiers 6 and 7. Level-up gifts are one random tier 4–7 card. Five cards per digital pack; the last draw uses tier 3+ cards when available. Per-card weights by tier 0–7 are 40, 35, 23, 14, 8, 5, 3, 1. Duplicates are possible. These are custom game rules, not physical Kayou pack odds. Unclassified specials use a clearly marked fan-made pack.</p><p>Daily shops and gifts reset at midnight UTC. Switch ponies freely; levels belong to each individual pony. NPC visits last 20 minutes, with a one-hour cooldown from arrival. Gentle motion is available in settings. The game has no payments, advertising, or analytics.</p></div>`,
    true,
  );
}
function packReveal() {
  if (!save.pendingPack) return;
  const pending = save.pendingPack;
  const set = catalog.sets.find((s) => s.id === pending.setId)!;
  if (!packRipped) {
    openModal(
      'A little magic inside',
      `<div class="pack-opening"><p>Five little treasures. One lovely surprise.</p><button class="rip-target" data-action="rip" aria-label="Rip open ${e(set.name)} pack">${packArt(set.id)}<span class="rip-line">${icon('arrow')} TAP TO RIP OPEN</span></button><p class="fine-print">Your cards are already safely in your collection.</p></div>`,
    );
    return;
  }
  if (packIndex >= pending.cardIds.length) {
    const cards = pending.cardIds.map((id) => cardById(id)!);
    openModal(
      'Five new reasons to smile',
      `<p class="modal-intro">All tucked safely into your collection. Duplicates stay in your binder, too.</p>${pending.petDrops?.length ? `<p class="pet-drop-note">${icon('heart')} New virtual pet${pending.petDrops.length > 1 ? 's' : ''}: ${pending.petDrops.map((p) => e(pony(p.ponyId).name) + ' (' + e(p.rarity) + ')').join(', ')}!</p>` : ''}<div class="reveal-summary">${cards.map((c) => cardTile(c)).join('')}</div><button class="button primary full" data-action="finish-pack">Into the binder ${icon('arrow')}</button>`,
      true,
    );
    return;
  }
  const c = cardById(pending.cardIds[packIndex])!;
  openModal(
    'A little magic inside',
    `<div class="single-reveal"><span class="eyebrow">LITTLE TREASURE ${packIndex + 1} OF 5</span><div class="reveal-card card-image rarity-${c.tier}"><img src="${cardImage(c, 720)}" alt="${e(c.name)} ${e(c.rarity)}"/>${cardFinish()}</div><span class="rarity-label tier-${c.tier}">${e(c.rarity)} · ${save.collection[c.id] > 1 ? 'Another lovely copy' : 'New to your collection'}</span><h2>${e(c.name)}</h2><p>${c.ponyIds.length ? `${icon('heart')} Virtual pet: ${pending.petDrops?.some((p) => c.ponyIds.includes(p.ponyId) && c.rarity === p.rarity) ? 'New companion unlocked!' : c.tier >= 6 ? 'Guaranteed matching companion' : 'Possible bonus drop'}` : 'Includes virtual pet: No'}</p><button class="button primary" data-action="next-card">${packIndex === 4 ? 'See all five' : 'Reveal the next card'} ${icon('arrow')}</button><button class="text-button" data-action="reveal-all">Reveal all</button></div>`,
  );
}
function miniBlocks(type: number | null) {
  if (!type) return '<span class="muted">—</span>';
  return `<div class="mini-blocks" style="grid-template-columns:repeat(${SHAPES[type][0].length},14px)">${SHAPES[
    type
  ]
    .flat()
    .map((v) => `<i style="background:${v ? BLOCK_COLORS[v] : 'transparent'}"></i>`)
    .join('')}</div>`;
}
function renderBlocks() {
  const caster = pony(save.caster);
  return (
    title(
      'A LITTLE PLAY, A LITTLE PAYDAY',
      'Magic Blocks',
      'Stack a little magic. Clear a line. Collect a pocketful of bits.',
      `<button class="button secondary" data-action="block-help">How to play ${icon('book')}</button>`,
    ) +
    `<div class="blocks-layout"><aside class="game-side"><div class="magic-companion" style="--aura:${caster.color}"><p class="eyebrow">YOUR MAGIC COMPANION</p><div class="magic-pony"><span class="horn-aura" aria-hidden="true"></span><img src="${ponyImage(caster, prefs.reducedMotion)}" alt="${e(caster.name)}"/></div><h2>${e(caster.name)}</h2><p>A little magic in every move.</p><label class="sr-only" for="caster-select">Choose magic companion</label><select id="caster-select">${save.casters.map((id) => `<option value="${id}" ${save.caster === id ? 'selected' : ''}>${e(pony(id)?.name || id)}</option>`).join('')}</select></div><div class="game-tip"><span>${icon('coin')}</span><h3>Play your way to a little treasure.</h3><p>40 bits for a line.<br>300 for four at once.<br>Keep a combo for a lovely bonus.</p><button class="text-button" data-nav="shop">Spend your bits ${icon('arrow')}</button></div></aside><section class="game-center" aria-label="Magic Blocks game"><div class="game-topbar"><span>${icon('spark')} A LITTLE MAGIC GOES A LONG WAY</span><button class="icon-button" data-action="pause" aria-label="Pause or resume game">${icon('pause')}</button></div><div class="board-wrap"><canvas id="board" tabindex="0" aria-label="Tetris board. Use arrow keys to move, Up to rotate, Space to drop, C to hold, and P to pause." role="img"></canvas><div id="game-overlay" class="game-overlay"></div></div><div class="touch-controls" aria-label="Touch game controls"><button data-game="left" aria-label="Move left">←</button><button data-game="rotate" aria-label="Rotate clockwise">${icon('rotate')}</button><button data-game="right" aria-label="Move right">→</button><button data-game="down" aria-label="Soft drop">↓</button><button data-game="drop" aria-label="Hard drop">⇓<span>Drop</span></button><button data-game="hold" aria-label="Hold piece">${icon('cards')}<span>Hold</span></button></div></section><aside class="game-score-panel"><div class="score-box"><p>SCORE</p><strong id="game-score">0</strong><span>Best <b id="best-score">${save.bestScore.toLocaleString()}</b></span></div><div class="game-stat-row"><div><p>LINES</p><strong id="game-lines">0</strong></div><div><p>LEVEL</p><strong id="game-level">1</strong></div></div><div class="earned-bits"><span>${icon('coin')} BITS EARNED</span><strong id="game-coins">0</strong><small>Saved after every clear</small></div><div class="preview-box"><p>UP NEXT</p><div id="next-pieces"></div></div><div class="preview-box"><p>HOLD <kbd>C</kbd></p><div id="held-piece">—</div></div><div class="keyboard-guide"><span><kbd>←</kbd><kbd>→</kbd> Move</span><span><kbd>↑</kbd> Rotate</span><span><kbd>↓</kbd> Soft drop</span><span><kbd>Space</kbd> Drop</span><span><kbd>P</kbd> Pause</span></div></aside></div><p class="fine-print">Take your time. Pause whenever you need to. All earned bits are yours to keep.</p>`
  );
}
function mountGame() {
  if (!game) createGame();
  requestAnimationFrame(fitGame);
  const canvas = document.querySelector<HTMLCanvasElement>('#board')!;
  let overlayState = '';
  const loop = (time: number) => {
    if (view !== 'blocks') return;
    if (!game!.paused && !modal.open && time - lastTick > game!.interval) {
      game!.tick();
      lastTick = time;
    }
    drawGame(canvas, game!, pony(save.caster).color, prefs.reducedMotion);
    document.querySelector('#game-score')!.textContent = game!.score.toLocaleString();
    document.querySelector('#game-lines')!.textContent = String(game!.lines);
    document.querySelector('#game-level')!.textContent = String(game!.level);
    document.querySelector('#game-coins')!.textContent = game!.coins.toLocaleString();
    document.querySelector('#next-pieces')!.innerHTML = game!.queue.slice(0, 3).map(miniBlocks).join('');
    document.querySelector('#held-piece')!.innerHTML = miniBlocks(game!.held);
    const state = game!.over ? 'over' : !game!.started ? 'start' : game!.paused ? 'pause' : 'running';
    if (state !== overlayState) {
      overlayState = state;
      const el = document.querySelector('#game-overlay')!;
      el.classList.toggle('hidden', state === 'running');
      el.innerHTML =
        state === 'running'
          ? ''
          : `<span class="overlay-spark">✦</span><h2>${state === 'start' ? 'Make a little magic' : state === 'over' ? 'A lovely little game' : 'Take a little breather'}</h2><p>${state === 'start' ? 'Your next pack is a few lines away.' : state === 'over' ? `${game!.coins} bits earned. All safely saved.` : 'Your pony will keep your place.'}</p><button class="button primary" data-action="${state === 'over' ? 'restart' : 'start-game'}">${icon('play')} ${state === 'start' ? 'Let’s play' : state === 'over' ? 'Play again' : 'Keep playing'}</button>`;
    }
    if (game!.over && !gameOverSaved) {
      gameOverSaved = true;
      const next = structuredClone(save);
      next.bestScore = Math.max(next.bestScore, game!.score);
      journal(next, `A little Magic Blocks: ${game!.lines} lines and ${game!.coins} bits.`);
      try {
        commit(next);
      } catch (err) {
        toast(errorMessage(err));
      }
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}
function createGame() {
  gameOverSaved = false;
  game = new Tetris(
    (coins, lines) => {
      const s = structuredClone(save);
      s.coins += coins;
      s.totalLines += lines;
      s.bestScore = Math.max(s.bestScore, game!.score);
      try {
        commit(awardXP(s, lines * 8, catalog));
        sound.play('clear');
        toast(
          `${lines === 4 ? 'A little four-line magic!' : `${lines} ${lines === 1 ? 'line' : 'lines'} cleared!`} +${coins} bits`,
        );
      } catch (err) {
        game!.paused = true;
        toast(errorMessage(err));
      }
    },
    () => {
      try {
        commit(awardXP(structuredClone(save), 2, catalog));
      } catch (err) {
        game!.paused = true;
        toast(errorMessage(err));
      }
    },
  );
}
function gameAction(action: string) {
  if (!game || view !== 'blocks' || modal.open) return;
  if (action === 'left') game.move(-1);
  if (action === 'right') game.move(1);
  if (action === 'rotate') game.rotate();
  if (action === 'down') game.softDrop();
  if (action === 'drop') game.hardDrop();
  if (action === 'hold') game.hold();
  if (!game.paused) sound.play(action === 'rotate' ? 'rotate' : action === 'drop' ? 'drop' : 'move');
}
function navigate(next: string, preserveFilters = false) {
  if (!views.includes(next)) next='home';
  if (!save.pet) return;
  if (next === 'collection' && !preserveFilters) resetCollectionFilters();
  if (view === 'blocks' && game) {
    game.paused = true;
    if (game.score > save.bestScore) commit({ ...save, bestScore: game.score });
  }
  modal.close();
  view = next;
  location.hash = next;
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function activeFriends() {
  return friends.filter(
    (f) => Date.now() - f.updatedAt < 65000 && catalog.ponies.some((p) => p.id === f.ponyId),
  );
}
function refreshFriends() {
  const online = social.room ? activeFriends().filter((f) => f.roomCode === social.code) : [],
    npc = activeNPC(save);
  const visitors = [...online];
  if (npc)
    visitors.push({
      uid: 'npc:' + npc.ponyId,
      name: pony(npc.ponyId).name,
      ponyId: npc.ponyId,
      rarity: 'R',
      tier: 1,
      x: 62,
      updatedAt: Date.now(),
    });
  meadow?.friends(visitors);
  const label = document.querySelector('#meadow-presence-label');
  if (label)
    label.textContent = online.length
      ? `${online.length + 1} friends${npc ? ' + an NPC visitor' : ''} in the meadow`
      : npc
        ? 'A little NPC playdate'
        : 'Your own little haven';
  const status = document.querySelector('#friend-status');
  if (status)
    status.textContent = online.length
      ? `${online.map((f) => f.name).join(', ')} ${online.length === 1 ? 'is' : 'are'} here. Stay close to grow your friendship.`
      : desktop || cloudConfigured
        ? 'Your friends will appear here when they visit.'
        : 'Your shared meadow awaits account setup.';
  const npcStatus = document.querySelector('#npc-status');
  if (npcStatus) npcStatus.innerHTML = npcSummary();
  const invite = document.querySelector<HTMLButtonElement>('[data-action="invite-npc"]');
  if (invite) {
    invite.disabled = save.npcCooldownUntil > Date.now();
    invite.innerHTML = icon('users') + (invite.disabled ? 'Visitor invited' : 'Invite a friend');
  }
  const cooldown = document.querySelector('[data-pet-cooldown]');
  if (cooldown)
    cooldown.textContent =
      petChangeRemaining(save) > 0
        ? `Next pony change in ${minutes(petChangeRemaining(save))}`
        : 'Switch ponies freely · Every pony keeps their own level';
  refreshOnline();
}

async function heartbeat() {
  if (!save?.pet || document.hidden || store.conflicted) return;
  refreshFriends();
  await store.presence(save, meadow?.x || 45, social.code, social.isHost ? social.code : '').catch(() => {});
  if (view === 'home') {
    const npc = activeNPC(save);
    const close =
      activeFriends().some(
        (f) => !!social.code && f.roomCode === social.code && Math.abs(f.x - (meadow?.x || 45)) < 20,
      ) || !!(npc && Math.abs((meadow?.friendX('npc:' + npc.ponyId) || 62) - (meadow?.x || 45)) < 22);
    if (close && Date.now() - save.friendshipAt > 60000) {
      const s = decay(structuredClone(save));
      s.friendshipAt = Date.now();
      s.stats.bond = clamp(s.stats.bond + 2);
      try {
        commit(awardXP(s, 2, catalog));
        refreshStats();
        meadow?.say('A little closer, a little more friendship. ♡');
      } catch {}
    }
  }
}
function countdown() {
  const left = 86400000 - (Date.now() % 86400000);
  const h = Math.floor(left / 3600000),
    m = Math.floor((left % 3600000) / 60000);
  document
    .querySelectorAll('[data-countdown]')
    .forEach((el) => (el.textContent = `${h}h ${String(m).padStart(2, '0')}m`));
}
const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong. Please try again.';

document.addEventListener('click', async (ev) => {
  const target = (ev.target as HTMLElement).closest<HTMLElement>('button,a,label');
  if (!target) return;
  sound.unlock();
  try {
    if (target.dataset.nav) {
      ev.preventDefault();
      navigate(target.dataset.nav);
      return;
    }
    if (target.dataset.starter) {
      selectedStarter = target.dataset.starter;
      renderWelcome();
      return;
    }
    if (target.dataset.care) {
      const action = target.dataset.care as 'feed' | 'play' | 'rest' | 'pet' | 'brush' | 'transform';
      if (meadow?.isBathing() && action === 'pet') return;
      const points = { feed: 4, play: 6, rest: 3, pet: 2, brush: 3, transform: 3 };
      commit(awardXP(care(save, action), points[action], catalog));
      meadow?.interact(action);
      refreshStats();
      sound.play(action);
      toast(
        {
          feed: 'A tasty treat! Tummy +20 · Energy +8',
          play: 'Happy hooves! Play uses tummy, energy, and a little cleanliness.',
          rest: 'Cozy time. Energy +22',
          pet: 'A little love. Friendship +2',
          brush: 'All brushed clean. Wellbeing +28',
          transform: 'A little transformation, for 10 seconds.',
        }[action],
      );
      return;
    }
    if (target.dataset.card) {
      detail(cardById(target.dataset.card)!);
      return;
    }
    if (target.dataset.pack) {
      commit(
        buyPack(
          save,
          catalog.sets.find((s) => s.id === target.dataset.pack)!,
          catalog,
        ),
      );
      sound.play('buy');
      packRipped = false;
      packIndex = -1;
      render();
      packReveal();
      return;
    }
    if (target.dataset.buyCard) {
      commit(buyCard(save, cardById(target.dataset.buyCard)!, catalog));
      sound.play('buy');
      render();
      toast('A new little treasure, safely in your binder.');
      return;
    }
    if (target.dataset.buyCaster) {
      commit(buyCaster(save, target.dataset.buyCaster, catalog));
      sound.play('buy');
      render();
      toast('Your new Magic Blocks companion is ready!');
      return;
    }
    if (target.dataset.pool) {
      series = target.dataset.pool;
      collectionMode = 'all';
      search = '';
      rarity = '';
      petOnly = false;
      page = 1;
      navigate('collection', true);
      return;
    }
    if (target.dataset.collectionMode) {
      collectionMode = target.dataset.collectionMode;
      page = 1;
      render();
      return;
    }
    if (target.dataset.page) {
      page = Number(target.dataset.page);
      render();
      window.scrollTo(0, 220);
      return;
    }
    if (target.dataset.pet) {
      const pet = unlockedPets(save, catalog.cards).find(
        (p) => p.ponyId === target.dataset.pet && p.rarity === target.dataset.petRarity,
      )!;
      commit(changePet(save, pet, catalog.cards));
      modal.close();
      render();
      void heartbeat();
      toast(`${pony().name} is making themself at home.`);
      return;
    }
    if (target.dataset.game) {
      gameAction(target.dataset.game);
      return;
    }
    switch (target.dataset.action) {
      case 'sync-account':
        syncDialog();break;
      case 'connect-sync': {
        ev.preventDefault();
        if (running) throw new Error('Close your game before connecting sync.');
        const account=document.querySelector<HTMLInputElement>('#sync-account')!;
        const password=document.querySelector<HTMLInputElement>('#sync-password')!;
        (target as HTMLButtonElement).disabled=true;
        try {await store.connectDesktop(account.value,password.value,save);await refreshDesktop();modal.close();if(save.pet)render();else renderWelcome();toast(store.conflicted?'Choose the synced save to continue.':'Your mobile account is connected.');}
        finally {password.value='';(target as HTMLButtonElement).disabled=false;}
        break;
      }
      case 'disconnect-sync':
        await store.disconnectDesktop();await refreshDesktop();settings();break;
      case 'reload-cloud':
        if (running) throw new Error('Close your game before loading another save.');
        await store.reloadCloud();break;
      case 'export-conflict': {
        const raw=localStorage.getItem(store.key+':conflict-backup');
        if(!raw)throw new Error('No conflicting device backup is waiting.');
        const backup=JSON.parse(raw).save;
        if(desktop)await desktop.exportSave(backup);
        else {const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='ponyhaven-device-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
        break;
      }
      case 'begin':
        commit(chooseStarter(save, selectedStarter, catalog));
        view = 'home';
        render();
        toast('Welcome to your little haven.');
        void heartbeat();
        break;
      case 'close': {
        const shared = !!modal.querySelector('.social-panel');
        modal.close();
        if (shared && view === 'home') window.scrollTo({ top: 0, behavior: 'instant' });
        break;
      }
      case 'settings':
        settings();
        break;
      case 'bath': {
        const enabled = meadow?.toggleBath();
        target.classList.toggle('selected', !!enabled);
        target.setAttribute('aria-pressed', String(!!enabled));
        toast(
          enabled
            ? 'Hold the water over your pony to wash. Tap Bath again to finish.'
            : 'All done with bath time.',
        );
        break;
      }
      case 'previous-background':
        await cycleBackground(-1);
        break;
      case 'next-background':
        await cycleBackground(1);
        break;
      case 'rewards':
        rewardDialog();
        break;
      case 'claim-reward':
        commit({ ...save, levelRewards: save.levelRewards.slice(1) });
        if (save.levelRewards.length) rewardDialog();
        else {
          modal.close();
          refreshStats();
        }
        break;
      case 'reset-account':
        openModal(
          'Begin a new little adventure',
          `<p class="modal-intro">This clears your cards, unlocked pets, pony levels, and bits. Your invitation or sign-in stays. A backup of this game will be kept on this device.</p><label class="field-label" for="reset-confirm">Type RESET to start again with 0 bits</label><input id="reset-confirm" autocomplete="off"/><button class="button primary full" data-action="confirm-reset">Reset my game</button>`,
        );
        break;
      case 'confirm-reset':
        if (document.querySelector<HTMLInputElement>('#reset-confirm')!.value !== 'RESET')
          throw new Error('Type RESET to confirm.');
        localStorage.setItem(store.key + ':before-reset', JSON.stringify(save));
        if (running) throw new Error('Close your game before resetting this profile.');
        await desktop?.backup();
        await social.leave();
        commit({ ...freshSave(save.name), coins: 0 });
        meadow?.destroy();
        meadow = null;
        cancelAnimationFrame(raf);
        game = null;
        modal.close();
        view = 'home';
        document.body.classList.remove('blocks-view');
        renderWelcome();
        toast('A fresh start. Your previous game is backed up on this device.');
        break;
      case 'host-meadow':
        await social.host(
          save.name,
          chosenBackground().id,
          prefs.background === 'custom' ? await roomBackground(await backgroundBlob()) : '',
          prefs.time,
        );
        friendsDialog();
        sound.play('visit');
        break;
      case 'join-meadow':
        await social.join(document.querySelector<HTMLInputElement>('#join-code')!.value);
        friendsDialog();
        sound.play('visit');
        break;
      case 'leave-meadow':
        await social.leave();
        friendsDialog();
        break;
      case 'invite-player': {
        const uid = document.querySelector<HTMLSelectElement>('#online-friends')!.value;
        if (!uid) throw new Error('Choose an online friend.');
        if (!social.room)
          await social.host(
            save.name,
            chosenBackground().id,
            prefs.background === 'custom' ? await roomBackground(await backgroundBlob()) : '',
            prefs.time,
          );
        await social.invite(uid, save.name);
        friendsDialog();
        toast('Your invitation is on its way.');
        break;
      }
      case 'accept-invite':
        if (social.invitation) {
          await social.join(social.invitation.code);
          await social.dismissInvitation();
          navigate('home');
          sound.play('visit');
        }
        break;
      case 'dismiss-invite':
        await social.dismissInvitation();
        break;
      case 'copy-code':
        await navigator.clipboard.writeText(social.code);
        toast('Meadow code copied.');
        break;
      case 'pets':
        petPicker();
        break;
      case 'invite-npc':
        commit(inviteNPC(save, catalog));
        render();
        toast(`${pony(save.npc!.ponyId).name} is visiting for 20 minutes.`);
        void heartbeat();
        break;
      case 'gift':
        commit(dailyGift(save));
        render();
        toast('+150 bits. A little gift, just for you.');
        break;
      case 'shop':
        navigate('shop');
        break;
      case 'credits':
        credits();
        break;
      case 'background':
        backgroundSettings();
        break;
      case 'restore-background':
        canChangeBackground();
        await backgroundBlob(null);
        if (backgroundUrl) URL.revokeObjectURL(backgroundUrl);
        backgroundUrl = null;
        prefs.background = null;
        savePreferences(prefs);
        await shareBackground();
        render();
        backgroundSettings();
        toast('Back home in Ponyville.');
        break;
      case 'time':
        canChangeBackground();
        prefs.time = prefs.time === 'day' ? 'night' : 'day';
        savePreferences(prefs);
        await shareBackground();
        render();
        break;
      case 'save-name': {
        const name = document.querySelector<HTMLInputElement>('#display-name')!.value.trim();
        if (!name) throw new Error('A little name, please.');
        if (desktop) { await desktop.rename(name); await refreshDesktop(); }
        commit({ ...save, name: name.slice(0, 24) });
        render();
        settings();
        toast('Your name is saved.');
        break;
      }
      case 'export': {
        if (desktop) { await desktop.exportSave(save); break; }
        const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ponyhaven-save-${dayKey()}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        break;
      }
      case 'logout':
        await social.leave();
        await store.logout();
        location.reload();
        break;
      case 'login':
        ev.preventDefault();
        target.setAttribute('disabled', '');
        try {
          await accountLogin(
            document.querySelector<HTMLInputElement>('#login-account')!.value,
            document.querySelector<HTMLInputElement>('#login-password')!.value,
          );
          location.reload();
        } catch (err) {
          target.removeAttribute('disabled');
          throw err;
        }
        break;
      case 'retry':
        location.reload();
        break;
      case 'activate':
        ev.preventDefault();
        if (!desktop) break;
        target.setAttribute('disabled', '');
        try {
          await desktop.activate(document.querySelector<HTMLInputElement>('#activation-key')!.value,
            document.querySelector<HTMLInputElement>('#activation-name')!.value);
          location.reload();
        } catch(err) { target.removeAttribute('disabled'); throw err; }
        break;
      case 'profiles':
        await refreshDesktop();
        openModal('Your local profiles', `<p class="modal-intro">Each name has its own ponies, cards, bits, and records on this computer.</p><div class="profile-list">${desktopProfile!.profiles.map((p)=>`<button class="button secondary" data-action="select-profile" data-profile="${e(p.id)}">${e(p.name)} ${p.id===desktopProfile!.profile?.id?'· current':''}</button>`).join('')}</div><label class="field-label" for="new-profile-name">Create another local profile</label><div class="input-row"><input id="new-profile-name" maxlength="24"/><button class="button primary" data-action="create-profile">Create</button></div>`);
        break;
      case 'select-profile':
      case 'create-profile':
        if (running) throw new Error('Close your game before changing profiles.');
        await social.leave(); await store.flush();
        if (target.dataset.action === 'select-profile') await desktop!.selectProfile(target.dataset.profile!);
        else await desktop!.createProfile(document.querySelector<HTMLInputElement>('#new-profile-name')!.value);
        location.reload();
        break;
      case 'remove-level':
        await removeLevel(target.dataset.arcade as ArcadeGame,target.dataset.pack!);
        break;
      case 'import-level':
        await importLevel(target.dataset.arcade as ArcadeGame);
        break;
      case 'launch-arcade':
        target.setAttribute('disabled','');
        try { await launchArcade(target.dataset.arcade as ArcadeGame,target.dataset.mode as 'solo'|'host'|'join'); }
        catch(err) {target.removeAttribute('disabled');throw err;}
        break;
      case 'stop-arcade':
        await desktop?.stopGame();
        break;
      case 'app-fullscreen':
        if (desktop) await desktop.fullscreen();
        else if(document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
        break;
      case 'clear-filters':
        search = series = rarity = '';
        petOnly = false;
        page = 1;
        render();
        break;
      case 'friends':
        friendsDialog();
        break;
      case 'resume-pack':
        packRipped = false;
        packIndex = -1;
        packReveal();
        break;
      case 'rip':
        if (packRipped) break;
        sound.play('rip');
        packRipped = true;
        target.classList.add('ripping');
        target.setAttribute('disabled', '');
        setTimeout(
          () => {
            packIndex = 0;
            packReveal();
          },
          prefs.reducedMotion ? 0 : 650,
        );
        break;
      case 'next-card':
        packIndex++;
        packReveal();
        sound.play('reveal', cardById(save.pendingPack?.cardIds[packIndex] || '')?.tier || 1);
        break;
      case 'reveal-all':
        packIndex = 5;
        packReveal();
        break;
      case 'finish-pack':
        commit({ ...save, pendingPack: null });
        modal.close();
        navigate('collection');
        toast('Five little treasures. All yours.');
        break;
      case 'start-game':
        if (!game?.started) {
          commit(awardXP(structuredClone(save), 1, catalog));
          sound.play('start');
        }
        game?.start();
        lastTick = performance.now();
        document.querySelector<HTMLCanvasElement>('#board')?.focus();
        break;
      case 'restart':
        createGame();
        commit(awardXP(structuredClone(save), 1, catalog));
        sound.play('start');
        game!.start();
        lastTick = performance.now();
        document.querySelector<HTMLCanvasElement>('#board')?.focus();
        break;
      case 'pause':
        if (game?.started && !game.over) game.paused = !game.paused;
        break;
      case 'block-help':
        openModal(
          'A little guide to Magic Blocks',
          `<div class="prose"><p>Move and rotate falling pieces to fill a complete horizontal line. Filled lines disappear and earn bits. Keep the stack below the top.</p><p><b>Keyboard:</b> ← → move, ↑ or X rotate, Z rotate back, ↓ soft drop, Space hard drop, C hold, P or Escape pause. Mobile players can use the six buttons below the board.</p><p><b>Generous little rewards:</b> one line 40 bits, two 100, three 180, four 300. Consecutive line-clearing pieces add 30 bits per combo step. Back-to-back four-line clears add 100.</p><p>The faded piece shows where a hard drop will land. Hold swaps one piece per turn. Your companion’s aura follows every active piece. Bits save after each clear, even if you leave the game.</p></div>`,
        );
        break;
    }
  } catch (err) {
    toast(errorMessage(err));
  }
});
document.addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el.id === 'card-search') {
    search = el.value;
    updateCollection();
  }
});
document.addEventListener('change', async (ev) => {
  const el = ev.target as HTMLInputElement;
  try {
    if (el.id === 'series-filter') {
      series = el.value;
      updateCollection();
    }
    if (el.id === 'rarity-filter') {
      rarity = el.value;
      updateCollection();
    }
    if (el.id === 'pet-filter') {
      petOnly = el.checked;
      updateCollection();
    }
    if (el.id === 'caster-select') {
      commit({ ...save, caster: el.value });
      if (game) game.paused = true;
      render();
    }
    if (el.id === 'sound-setting') {
      prefs.quiet = !el.checked;
      sound.muted = prefs.quiet;
      savePreferences(prefs);
      if (!prefs.quiet) sound.play('pet');
    }
    if (el.id === 'motion-setting') {
      prefs.reducedMotion = el.checked;
      savePreferences(prefs);
      render();
    }
    if (el.id === 'background-upload' && el.files?.[0] && !uploadBusy) {
      canChangeBackground();
      uploadBusy = true;
      try {
        const blob = await prepareBackground(el.files[0]);
        await backgroundBlob(blob);
        if (backgroundUrl) URL.revokeObjectURL(backgroundUrl);
        backgroundUrl = URL.createObjectURL(blob);
        prefs.background = 'custom';
        savePreferences(prefs);
        await shareBackground();
        render();
        backgroundSettings();
        toast('A new view for your little world.');
      } finally {
        uploadBusy = false;
      }
    }
    if (el.id === 'import-save' && el.files?.[0]) {
      if (el.files[0].size > 2e6) throw new Error('This save file is too large.');
      const imported = readSave(JSON.parse(await el.files[0].text()));
      if (!imported) throw new Error('This is not a valid Ponyhaven save.');
      if (imported.pet && !catalog.ponies.some((p) => p.id === imported.pet!.ponyId))
        throw new Error('This save contains an unknown companion.');
      if (imported.casters.some((id) => !catalog.ponies.some((p) => p.id === id && p.unicorn)))
        throw new Error('This save contains an unknown magic companion.');
      if (imported.npc && !catalog.ponies.some((p) => p.id === imported.npc!.ponyId))
        throw new Error('This save contains an unknown visitor.');
      if (
        imported.pendingPack &&
        (!catalog.sets.some((s) => s.id === imported.pendingPack!.setId) ||
          imported.pendingPack.cardIds.some((id) => !cardById(id)))
      )
        throw new Error('This save contains an unknown pack or card.');
      if (
        imported.petUnlocks.some((p) => !catalog.ponies.some((q) => q.id === p.ponyId)) ||
        Object.keys(imported.ponyProgress).some((id) => !catalog.ponies.some((p) => p.id === id)) ||
        imported.levelRewards.some(
          (r) => !cardById(r.cardId) || !catalog.ponies.some((p) => p.id === r.ponyId),
        )
      )
        throw new Error('This save contains an unknown pet or level gift.');
      localStorage.setItem(`${store.key}:before-import`, JSON.stringify(save));
      if (running) throw new Error('Close your game before importing a save.');
      await desktop?.backup();
      if (desktop) imported.name = save.name;
      commit(migrateProgress(imported, catalog));
      modal.close();
      if (save.pet) render();
      else renderWelcome();
      toast('Save imported. Your previous save is backed up on this device.');
    }
  } catch (err) {
    toast(errorMessage(err));
  }
});
document.addEventListener('keydown', (ev) => {
  if (
    view !== 'blocks' ||
    modal.open ||
    /INPUT|SELECT|TEXTAREA|BUTTON/.test((ev.target as HTMLElement).tagName)
  )
    return;
  const actions: Record<string, string> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'rotate',
    ArrowDown: 'down',
    ' ': 'drop',
    c: 'hold',
    C: 'hold',
    x: 'rotate',
    X: 'rotate',
  };
  if (actions[ev.key]) {
    ev.preventDefault();
    gameAction(actions[ev.key]);
  }
  if (ev.key === 'z' || ev.key === 'Z') {
    ev.preventDefault();
    game?.rotate(-1);
  }
  if (['p', 'P', 'Escape'].includes(ev.key) && game?.started) {
    ev.preventDefault();
    game.paused = !game.paused;
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (game) game.paused = true;
    void store.flush();
    void store.leave();
  } else void heartbeat();
});
document.addEventListener(
  'error',
  (ev) => {
    const img = ev.target as HTMLImageElement;
    if (img.tagName === 'IMG' && !img.dataset.fallback) {
      img.dataset.fallback = 'true';
      img.src = asset('assets/card-back.svg');
      img.alt = `${img.alt} (image unavailable)`;
    }
  },
  true,
);
window.addEventListener('online', () => void store.flush());
window.addEventListener('beforeunload', () => {
  void store.flush();
});
window.addEventListener('hashchange', () => {
  const next = location.hash.slice(1);
  if (save?.pet && views.includes(next) && next !== view) navigate(next);
});
modal.addEventListener('close', () => {
  const target = modalReturnFocus?.isConnected
    ? modalReturnFocus
    : document.querySelector<HTMLElement>('#main');
  target?.focus({ preventScroll: true });
});
modal.addEventListener('click', (ev) => {
  if (ev.target === modal) {
    const rect = modal.getBoundingClientRect();
    if (
      ev.clientX < rect.left ||
      ev.clientX > rect.right ||
      ev.clientY < rect.top ||
      ev.clientY > rect.bottom
    )
      modal.close();
  }
});

function renderLogin() {
  if (desktop) {
    app.innerHTML = `<main class="login-screen"><span class="brand-mark">${icon('spark')}</span><p class="eyebrow">AN INVITATION TO A LITTLE MAGIC</p><h1>Welcome to Ponyhaven.</h1><p>Give your little world a name, and enter the key your host shared.</p><form id="activation-form"><label for="activation-name">Your username</label><input id="activation-name" autocomplete="nickname" minlength="2" maxlength="24" required/><label for="activation-key">Invitation license key</label><input id="activation-key" type="password" autocomplete="off" spellcheck="false" required/><button type="submit" class="button primary full" data-action="activate">Activate my invitation ${icon('arrow')}</button></form><p class="activation-note">An internet connection is needed just this once to validate your invitation with Gumroad. After activation, your profile saves on this computer and solo play works offline. Your key is never shared with other players.</p><small>A free little fan game, for friends.</small></main>`;
    return;
  }
  app.innerHTML = `<main class="login-screen"><span class="brand-mark">${icon('spark')}</span><p class="eyebrow">YOUR LITTLE WORLD IS WAITING</p><h1>Welcome to Ponyhaven.</h1><p>Sign in with the account your host gave you.</p><form id="account-form"><label for="login-account">Username or email</label><input id="login-account" autocomplete="username" required/><label for="login-password">Password</label><input type="password" id="login-password" autocomplete="current-password" required/><button type="submit" class="button primary full" data-action="login">Come on in ${icon('arrow')}</button></form><small>A free little fan game, for friends.</small></main>`;
}
function friendsDialog() {
  openModal(
    'A meadow for friends',
    `<div class="social-panel"><p class="modal-intro">${social.room ? `Visiting ${e(social.room.hostName)}’s meadow. The host chooses the view.` : 'Host a little meadow, or join a friend with their code.'}</p>${social.room ? `<div class="join-code"><span>MEADOW CODE</span><strong>${social.code}</strong><button class="text-button" data-action="copy-code">Copy code</button></div><button class="button secondary" data-action="leave-meadow">${social.isHost ? 'Close this meadow' : 'Leave meadow'}</button>` : `<button class="button primary full" data-action="host-meadow" ${desktop || cloudConfigured ? '' : 'disabled'}>Host a meadow</button><label class="field-label" for="join-code">Or enter a friend’s code</label><div class="input-row"><input id="join-code" maxlength="8" placeholder="ABCDEFGH" autocomplete="off"/><button class="button secondary" data-action="join-meadow" ${desktop || cloudConfigured ? '' : 'disabled'}>Join</button></div>`}<label class="field-label" for="online-friends">Friends & their ponies</label><select id="online-friends"><option value="">No friends online just now</option></select><button class="button secondary full" ${desktop ? 'hidden' : ''} data-action="invite-player" ${desktop || cloudConfigured ? '' : 'disabled'}>Invite selected friend</button><p class="fine-print">${desktop ? 'Share your party code with friends. The host keeps the app open. Connected friends appear here; the host chooses the shared background.' : cloudConfigured ? 'Invitations expire after five minutes. Meadows stay open for up to eight hours.' : 'Shared meadows become available when your host finishes setting up accounts. Local play and NPC visits work now.'}</p></div>`,
  );
  refreshOnline();
}
function refreshOnline() {
  const select = document.querySelector<HTMLSelectElement>('#online-friends');
  if (!select) return;
  const selected = select.value,
    online = activeFriends();
  select.innerHTML = online.length
    ? online
        .map(
          (f) =>
            `<option value="${e(f.uid)}">${e(f.name)} · ${e(pony(f.ponyId).name)}${f.hostedRoom ? ' · Hosting a meadow' : ''}</option>`,
        )
        .join('')
    : '<option value="">No friends online just now</option>';
  if (online.some((f) => f.uid === selected)) select.value = selected;
}
function refreshInvitation() {
  document.querySelector('#social-invitation')?.remove();
  if (!social.invitation) return;
  const banner = document.createElement('div');
  banner.id = 'social-invitation';
  banner.className = 'invitation-banner';
  banner.innerHTML = `<span>${e(social.invitation.fromName)} invited you to their meadow.</span><button class="button primary" data-action="accept-invite">Join</button><button class="icon-button" data-action="dismiss-invite" aria-label="Dismiss invitation">${icon('close')}</button>`;
  app.append(banner);
}
social.onChange = () => {
  if (save?.pet) {
    if (view === 'home') render();
    void heartbeat();
  }
};
social.onInvitation = () => {
  refreshInvitation();
  if (social.invitation) sound.play('visit');
};
function fitGame() {
  if (view !== 'blocks') return;
  const board = document.querySelector<HTMLElement>('.board-wrap');
  if (!board) return;
  const compact = innerWidth <= 620 || (innerHeight < 600 && innerWidth < 1100);
  if (!compact) {
    board.style.removeProperty('width');
    board.style.removeProperty('height');
    return;
  }
  const nav = document.querySelector<HTMLElement>('nav')!,
    controls = document.querySelector<HTMLElement>('.touch-controls')!;
  const bottom =
    getComputedStyle(nav).position === 'fixed'
      ? nav.getBoundingClientRect().top
      : visualViewport?.height || innerHeight;
  const parent = board.parentElement!.getBoundingClientRect();
  const height = Math.floor(
    Math.max(
      120,
      Math.min(
        (parent.width - 16) * 2,
        bottom - board.getBoundingClientRect().top - controls.getBoundingClientRect().height - 22,
      ),
    ),
  );
  board.style.width = height / 2 + 'px';
  board.style.height = height + 'px';
}
window.addEventListener('resize', () => requestAnimationFrame(fitGame));
window.visualViewport?.addEventListener('resize', () => requestAnimationFrame(fitGame));
void document.fonts.ready.then(fitGame);
document.addEventListener('submit', (ev) => {
  if ((ev.target as HTMLElement).id === 'sync-form') {
    ev.preventDefault();document.querySelector<HTMLButtonElement>('[data-action="connect-sync"]')?.click();
  }
  if ((ev.target as HTMLElement).id === 'activation-form') {
    ev.preventDefault();document.querySelector<HTMLButtonElement>('[data-action="activate"]')?.click();
  }
  if ((ev.target as HTMLElement).id === 'account-form') {
    ev.preventDefault();
    document.querySelector<HTMLButtonElement>('[data-action="login"]')?.click();
  }
});

async function boot() {
  try {
    const [ponies, cards, sets] = await Promise.all(
      ['ponies', 'cards', 'sets'].map(async (f) => {
        const res = await fetch(asset(`data/${f}.json`));
        if (!res.ok) throw new Error('The little catalog could not be loaded. Please refresh.');
        return res.json();
      }),
    );
    catalog = { ponies, cards, sets };
    backgrounds = await (await fetch(asset('data/backgrounds.json'))).json();
    catalog.ponies.filter((p) => p.mane).forEach((p) => localStarters.add(p.starterCard!));
    const initial = await store.load();
    if (!initial) {
      renderLogin();
      return;
    }
    save = migrateProgress(initial, catalog);
    if (desktop) {
      localStorage.setItem('ponyhaven:active-profile', store.uid);
      prefs = getPreferences();sound.muted = prefs.quiet;
    }
    setupScores(() => { if(view === 'leaderboard') render(); });
    await setupArcade((event) => {
      if (store.conflicted) return 0;
      const result = arcadeReward(save, event);
      if (result.save !== save) {
        commit(result.xp ? awardXP(result.save,result.xp,catalog) : result.save);
        shareScores(save);
      }
      return result.bits;
    }, () => { if (['adventure','ponykart'].includes(view)) render(); }, toast);
    const blob = await backgroundBlob().catch(() => null);
    if (blob) backgroundUrl = URL.createObjectURL(blob);
    unsubscribeFriends = store.watchFriends((list) => {
      friends = list;
      refreshFriends();
    }, toast);
    const hash = location.hash.slice(1);
    if (views.includes(hash)) view = hash;
    if (save.pet) render();
    else renderWelcome();
    await social.start();
    countdown();
    setInterval(countdown, 30000);
    setInterval(() => {
      refreshStats();
      void heartbeat();
    }, 20000);
    let today = dayKey();
    setInterval(() => {
      if (dayKey() !== today) {
        today = dayKey();
        if (view === 'shop' || view === 'home') render();
      }
    }, 30000);
    void heartbeat();
    shareScores(save);
  } catch (err) {
    app.innerHTML = `<main class="login-screen"><span class="brand-mark">${icon('heart')}</span><h1>A little pause.</h1><p>${e(errorMessage(err))}</p><button class="button primary" data-action="retry">Try again</button>${cloudConfigured ? '<button class="button secondary" data-action="logout">Use a different account</button>' : ''}</main>`;
  }
}
void boot();
