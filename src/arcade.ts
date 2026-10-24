import courseCatalog from '../desktop/courses.json';
import { desktop, desktopProfile, type ArcadeEvent, type ArcadeGame, type LevelPack } from './desktop';
import { party } from './peer-party';
import { escape as e, icon } from './icons';
import type { Catalog, Save } from './types';
import { ponyImage } from './pet';
import { equestriaSelected, equestriaRunning, renderEquestria, worldTabs } from './equestria';

const rosters = {
  adventure: [['twilight','twilight-sparkle'],['applejack','applejack'],['fluttershy','fluttershy'],['rarity','rarity'],['derpy','derpy-hooves'],['luna','princess-luna'],['trixie','trixie']],
  ponykart: [['twilight','twilight-sparkle'],['applejack','applejack'],['fluttershy','fluttershy'],['rarity','rarity'],['rainbowdash','rainbow-dash'],['pinkiepie','pinkie-pie']],
};
export const courses=courseCatalog as Record<ArcadeGame,[number,string][]>;
export const gameNames = { adventure:'Bonus stages', ponykart:'Ponykart' };
export let running: {game:ArcadeGame;session:string;earned:number;ready:boolean} | null=null;
let available={adventure:false,ponykart:false};
let checked=false;
let levelPacks:Record<ArcadeGame,LevelPack[]>={adventure:[],ponykart:[]};
const preferenceKey=()=>`ponyhaven:arcade:${desktopProfile?.profile?.id || 'local'}`;
function preferences():{pastel:number;fullscreen:boolean} {
  try{return {pastel:55,fullscreen:false,...JSON.parse(localStorage.getItem(preferenceKey())||'{}')};}catch{return {pastel:55,fullscreen:false};}
}
export async function importLevel(game:ArcadeGame) { if(desktop){levelPacks[game]=await desktop.importLevel(game);changed();} }
export async function removeLevel(game:ArcadeGame,id:string) {if(desktop){levelPacks[game]=await desktop.removeLevel(game,id);changed();}}
let reward=(_event:ArcadeEvent)=>0, changed=()=>{}, notify=(_s:string)=>{};
export async function setupArcade(onEvent: (event:ArcadeEvent)=>number,onChange:()=>void,onNotice:(message:string)=>void) {
  reward=onEvent;changed=onChange;notify=onNotice;
  if(!desktop)return;
  available=await desktop.engines();checked=true;
  [levelPacks.adventure,levelPacks.ponykart]=await Promise.all([desktop.levels('adventure'),desktop.levels('ponykart')]);
  desktop.onGame((event)=>{
    if(event.type==='loading')running={game:event.game,session:event.session,earned:0,ready:false};
    if(event.type==='started')running={game:event.game,session:event.session,earned:0,ready:true};
    if(event.type==='progress' && running?.session===event.session)running.earned+=reward(event);
    if(['ended','error'].includes(event.type) && running?.session===event.session) {
      notify(event.message || `${gameNames[event.game]} finished · ${running.earned.toLocaleString()} bits saved.`);
      running=null;void party.endGame();
    }
    changed();
  });
  party.onGame=changed;
}
export function renderArcade(game:ArcadeGame,catalog:Catalog,save:Save) {
  if(game==='adventure' && equestriaSelected)return renderEquestria(catalog,save);
  const kart=game==='ponykart', stats=save.arcade[game];
  const hostedGame=party.game && party.game.game!=='equestria'?party.game:null;
  const prefs=preferences();
  const imported=levelPacks[game].map((p)=>`<optgroup label="${e(p.name)}">${p.maps.map((m)=>`<option value="${p.id}:${m.id}">${e(m.name)}</option>`).join('')}</optgroup>`).join('');
  const options=rosters[game].map(([id,ponyId])=>{
    const p=catalog.ponies.find((p)=>p.id===ponyId) || catalog.ponies.find((p)=>p.id.includes(id))!;
    return `<option value="${id}">${e(p?.name || id)}</option>`;
  }).join('');
  const mascot=catalog.ponies.find((p)=>p.id===(kart?'rainbow-dash':'twilight-sparkle'))!;
  return `${kart?'':worldTabs()}<div class="page-heading"><div><p class="eyebrow">A LITTLE ${kart?'FRIENDLY COMPETITION':'WORLD TO EXPLORE'}</p><h1>${gameNames[game]}</h1><p class="subheading">${kart?'Pick your pony. Find your line. Leave a little rainbow behind.':'A familiar friend, winding paths, and a pocketful of treasure.'}</p></div><button class="icon-button" data-action="app-fullscreen" aria-label="Toggle app fullscreen">⛶</button></div>
    <div class="arcade-layout"><section class="arcade-hero ${kart?'kart-hero':''}"><div><p class="eyebrow">${kart?'EVERY LAP IS A LITTLE ADVENTURE':'FOLLOW YOUR CURIOSITY'}</p><h2>${kart?'Ready, set…<br><em>friendship!</em>':'Over the hills.<br><em>Into the magic.</em>'}</h2><img src="${ponyImage(mascot)}" alt="${e(mascot.name)}"/><span class="arcade-badge">${kart?'50 bits / lap · 200 / finish':'1 fresh ring = 10 bits'}</span></div></section>
    <section class="arcade-launch"><h2>Your next ${kart?'race':'adventure'}</h2><label class="field-label" for="arcade-pony">Bring a pony</label><select id="arcade-pony">${options}</select><label class="field-label" for="arcade-course">${kart?'Course':'Trail'}</label><select id="arcade-course">${courses[game].map(([id,name])=>`<option value="${id}">${name}</option>`).join('')}${imported}</select><div class="arcade-import"><button class="text-button" data-action="import-level" data-arcade="${game}" ${!desktop||running?'disabled':''}>${icon('upload')} Import a level pack</button><small>${kart?'SRB2Kart 1.6':'SRB2 2.2'} &middot; WAD / PK3 &middot; up to 128 MB</small></div>${levelPacks[game].length?`<details class="imported-packs"><summary>Imported packs (${levelPacks[game].length})</summary>${levelPacks[game].map((p)=>`<div><span>${e(p.name)}</span><button class="text-button" data-action="remove-level" data-arcade="${game}" data-pack="${p.id}" ${running?'disabled':''}>Remove</button></div>`).join('')}</details>`:''}<label class="field-label" for="arcade-pastel">A softer world</label><select id="arcade-pastel">${[[0,'Original scenery'],[35,'A gentle touch'],[55,'Pastel scenery'],[80,'Extra soft scenery']].map(([value,label])=>`<option value="${value}" ${prefs.pastel===value?'selected':''}>${label}</option>`).join('')}</select><p class="fine-print">Softens the landscape. Pony colours and the HUD stay original.</p><label class="setting-toggle"><span>Open game fullscreen</span><input type="checkbox" id="arcade-fullscreen" ${prefs.fullscreen?'checked':''}/></label>
    ${running?`<div class="arcade-live" role="status"><strong>${running.ready?gameNames[running.game]+' is open':'Opening '+gameNames[running.game]+'…'}</strong><p>${running.ready?running.earned.toLocaleString()+' bits earned this visit':'Loading your pony and course. A game window will appear shortly.'}</p><button class="button secondary full" data-action="stop-arcade">${running.ready?'Finish & return':'Cancel launch'}</button></div>`:
    `<button class="button primary full" data-action="launch-arcade" data-mode="solo" data-arcade="${game}" ${!desktop || !available[game]?'disabled':''}>${icon('spark')} ${kart?'Go for a solo race':'Start exploring'}</button>${desktop && checked && !available[game]?'<p class="fine-print">The engine files need to be prepared for this build.</p>':''}`}
    <p class="fine-print">${desktop?'The game opens in its own window. Your bits save as you play.':'Available in the Ponyhaven desktop app.'}</p>
    <div class="arcade-controls"><h3>A few helpful keys</h3><p>${kart?'<kbd>W / ↑</kbd> Accelerate · <kbd>A D / ← →</kbd> Steer<br><kbd>Space</kbd> Drift · <kbd>X</kbd> Item · <kbd>S / ↓</kbd> Brake':'<kbd>W A S D</kbd> Move · <kbd>← →</kbd> Turn camera<br><kbd>Space</kbd> Jump / ability · <kbd>X</kbd> Spin'}</p><p><kbd>Esc</kbd> Menu · <kbd>Q</kbd> Return from menu · <kbd>Alt + Enter</kbd> Fullscreen</p></div></section></div>
    <div class="arcade-bottom"><section class="arcade-party"><h3>${icon('users')} Better with friends</h3>${party.room?`<p>Party code <strong class="party-code">${party.room.code}</strong> · ${party.friends.length+1} ${party.friends.length?'friends':'friend'}</p>${party.isHost?`<button class="button secondary" data-action="launch-arcade" data-mode="host" data-arcade="${game}" ${running?'disabled':''}>Host ${gameNames[game]}</button>`:hostedGame?`<button class="button primary" data-action="launch-arcade" data-mode="join" data-arcade="${hostedGame.game}" ${running?'disabled':''}>Join ${gameNames[hostedGame.game]}</button>`:party.game?.game==='equestria'?'<p>The host is exploring Equestria. </p><button class="text-button" data-action="equestria-select" data-world="equestria">Open Equestria</button>':'<p>The host can start a game when everyone is ready.</p>'}<button class="text-button" data-action="friends">Manage party</button>`:`<p>Host a party or enter an invite code. The same party can visit the meadow and play together.</p><button class="button secondary" data-action="friends">Open party</button>`}<p class="fine-print">${e(party.error || 'Keep Ponyhaven open while playing. Invite codes last while the host is here.')}</p></section><section class="arcade-personal"><h3>Your little milestones</h3><div><span><b>${stats.finishes}</b> finishes</span><span><b>${stats.bits.toLocaleString()}</b> bits earned</span><span><b>${kart?Object.keys(stats.bestTimes).length:stats.rings.toLocaleString()}</b> ${kart?'courses finished':'rings found'}</span></div><button class="text-button" data-nav="leaderboard">Visit the leaderboard ${icon('arrow')}</button></section></div>`;
}
export async function launchArcade(game:ArcadeGame,mode:'solo'|'host'|'join') {
  if(!desktop)throw new Error('Open this game in the desktop app.');
  if(equestriaRunning)throw new Error('Finish your Equestria adventure before starting another game.');
  let pony=(document.querySelector('#arcade-pony') as HTMLSelectElement).value;
  const selection=(document.querySelector('#arcade-course') as HTMLSelectElement).value.split(':');
  let pack=selection.length===2?selection[0]:undefined, map=Number(selection.at(-1));
  let port:number|undefined;
  if(mode==='join') {if(!party.game || party.game.game!==game)throw new Error('The host has not started this game.');map=party.game.map;pack=party.game.pack;if(!rosters[game].some(([id])=>id===pony))pony=rosters[game][0][0];if(pack && !levelPacks[game].some((p)=>p.id===pack))throw new Error('Import the same level pack as your host first.');port=await party.guestPort();}
  if(mode==='host' && !party.isHost)throw new Error('Host a party first.');
  const prefs={pastel:Number((document.querySelector('#arcade-pastel') as HTMLSelectElement).value),fullscreen:(document.querySelector('#arcade-fullscreen') as HTMLInputElement).checked};
  localStorage.setItem(preferenceKey(),JSON.stringify(prefs));
  try {
    const result=await desktop.launch({game,mode,map,pony,port,pack,...prefs});
    if(mode==='host') await party.hostGame({game,map,pack},result.port);
  } catch(e) { await party.endGame(); throw e; }
}

interface ScoreRow { id:string; name:string; blocks:number; adventure:number; adventureFinishes:number; times:Record<string,number>; updatedAt:number }
let friendScores:ScoreRow[]=[];
function ownScore(save:Save):ScoreRow { return {id:desktopProfile?.profile?.id || 'local',name:save.name,blocks:save.bestScore,adventure:save.arcade.adventure.bestScore,adventureFinishes:save.arcade.adventure.finishes,times:save.arcade.ponykart.bestTimes,updatedAt:Date.now()}; }
export function shareScores(save:Save) {party.updateScores(ownScore(save));}
export function setupScores(onChange:()=>void) {
  const key='ponyhaven:scores:'+(desktopProfile?.profile?.id || 'local');
  const validate=(s:ScoreRow)=>s && typeof s.id==='string' && s.id.length<=100 && typeof s.name==='string' && s.name.length<=24 &&
    [s.blocks,s.adventure,s.adventureFinishes,s.updatedAt].every((v)=>Number.isSafeInteger(v)&&v>=0&&v<1e15) &&
    s.times && Object.keys(s.times).length<=2048 && Object.values(s.times).every((v)=>Number.isInteger(v)&&v>0&&v<1e9);
  try {friendScores=JSON.parse(localStorage.getItem(key)||'[]').filter(validate).slice(0,100);}catch{friendScores=[];}
  party.onScores=(value)=>{
    const s=value as ScoreRow;if(!validate(s)||s.id===desktopProfile?.profile?.id)return;
    friendScores=[...friendScores.filter((r)=>r.id!==s.id),s].slice(-100);
    localStorage.setItem(key,JSON.stringify(friendScores));onChange();
  };
}
export const raceTime=(ticks:number)=>`${Math.floor(ticks/35/60)}:${(ticks/35%60).toFixed(2).padStart(5,'0')}`;
export function renderLeaderboard(save:Save) {
  const rows=[ownScore(save),...friendScores.filter((r)=>r.id!==desktopProfile?.profile?.id)];
  const ranking=(field:'blocks'|'adventure')=>[...rows].sort((a,b)=>b[field]-a[field]).map((r,i)=>`<tr><td>${i+1}</td><th scope="row">${e(r.name)}${r.id===ownScore(save).id?' <small>you</small>':''}</th><td>${r[field].toLocaleString()}</td></tr>`).join('');
  const races=courses.ponykart.map(([id,name])=>{
    const ranked=rows.filter((r)=>r.times[id]).sort((a,b)=>a.times[id]-b.times[id]);
    return `<section class="race-ranking"><h3>${name}</h3>${ranked.length?`<ol>${ranked.map((r)=>`<li><span>${e(r.name)}</span><strong>${raceTime(r.times[id])}</strong></li>`).join('')}</ol>`:'<p>No finish time yet. Make the first little mark.</p>'}</section>`;
  }).join('');
  return `<div class="page-heading"><div><p class="eyebrow">A FRIENDLY LITTLE RECORD BOOK</p><h1>Leaderboard</h1><p class="subheading">A place for personal bests and a little friendly competition.</p></div></div><p class="leaderboard-note">Your records save with your profile. Friends’ latest records are exchanged when you share a party, and remembered on this computer.</p><div class="leaderboard-grid">${(['blocks','adventure'] as const).map((field)=>`<section><h2>${field==='blocks'?'Magic Blocks':'Adventure'}</h2><table><thead><tr><th>Place</th><th>Friend</th><th>Best score</th></tr></thead><tbody>${ranking(field)}</tbody></table></section>`).join('')}</div><h2 class="race-heading">Ponykart · fastest course times</h2><div class="race-rankings">${races}</div>`;
}
