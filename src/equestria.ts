import {desktop,desktopProfile,type EquestriaStatus} from './desktop';
import {party} from './peer-party';
import type {Catalog,Save} from './types';
import type {EquestriaRewardEvent} from './equestria-rewards';
import type {EquestriaProgress} from './equestria-state';
import {chestReadyAt,freshEquestria,harmonyLevel,type HarmonyElement} from './equestria-state';
import {harmonyElements} from './equestria-wiki';
import {initialiseAdventures,selectedAdventure,createAdventure,loadAdventure,deleteAdventure} from './equestria-saves';
import {escape as e,icon} from './icons';
import {ponyImage} from './pet';
import './equestria.css';

export let equestriaSelected=true;
/** Which Adventure tab is open: Equestria, its wiki, or the SRB2 Bonus stages. */
export let adventureWorld:'equestria'|'wiki'|'trails'='equestria';
export let equestriaRunning:{mode:'solo'|'host'|'join';session:string;ready:boolean;player:string}|null=null;
let status:EquestriaStatus={engine:false,world:false,title:'Equestria 6 · Update 8'};
let changed=()=>{},notify=(_text:string)=>{},current=():Save=>{throw Error('Load your profile first.');};
let receive=async(_event:EquestriaRewardEvent):Promise<EquestriaProgress>=>{throw Error('Load your profile first.');};
let queue=Promise.resolve();
let write=async(_save:Save)=>{};
let saveMenu:'new'|'load'|null=null,deleteId='';
const preferenceKey=()=> 'ponyhaven:equestria-pony:'+ (desktopProfile?.profile?.id||'default');
const chosenPony=()=>localStorage.getItem(preferenceKey())||'twilight';
document.addEventListener('change',event=>{const el=event.target as HTMLInputElement;if(el.id==='equestria-pony'){localStorage.setItem(preferenceKey(),el.value);saveMenu=null;deleteId='';changed();}});
export function selectWorld(world:string){adventureWorld=world==='wiki'||world==='trails'?world:'equestria';equestriaSelected=adventureWorld==='equestria';}
export function worldTabs(){return `<div class="adventure-world-tabs" role="group" aria-label="Adventure world"><button class="${equestriaSelected?'selected':''}" data-action="equestria-select" data-world="equestria" aria-pressed="${equestriaSelected}">${icon('spark')} Equestria</button><button class="${adventureWorld==='wiki'?'selected':''}" data-action="equestria-select" data-world="wiki" aria-pressed="${adventureWorld==='wiki'}">Wiki</button><button class="${adventureWorld==='trails'?'selected':''}" data-action="equestria-select" data-world="trails" aria-pressed="${adventureWorld==='trails'}">Bonus stages</button></div>`;}
export async function setupEquestria(getSave:()=>Save,award:(event:EquestriaRewardEvent)=>Promise<EquestriaProgress>,onChange:()=>void,onNotice:(message:string)=>void,saveAdventure:(save:Save)=>Promise<void>){
 current=getSave;receive=award;changed=onChange;notify=onNotice;
 write=saveAdventure;const migrated=initialiseAdventures(current(),chosenPony());if(migrated!==current())await write(migrated);
 if(!desktop?.equestriaStatus)return;
 status=await desktop.equestriaStatus();
 const accept=(event:EquestriaRewardEvent)=>{
  let resolve:(s:EquestriaProgress)=>void,reject:(e:unknown)=>void;
  const result=new Promise<EquestriaProgress>((yes,no)=>{resolve=yes;reject=no;});
  queue=queue.catch(()=>{}).then(async()=>{try{resolve(await receive(event));}catch(error){reject(error);notify(error instanceof Error?error.message:'Treasure is waiting for your save to finish.');}});
  return result;
 };
 party.onEquestriaReward=async(event)=>{if(!equestriaRunning||equestriaRunning.mode!=='join')throw Error('Join Equestria before accepting rewards.');return accept(event);};
 desktop.onEquestria(event=>{
  if(event.kind==='loading'&&equestriaRunning)equestriaRunning.session=event.session;
  if(event.kind==='started'&&equestriaRunning){equestriaRunning.ready=true;equestriaRunning.player=event.player||'';}
  if(event.kind==='reward'&&event.event&&equestriaRunning?.session===event.session){
   if(event.own&&event.player)void accept(event.event).then(state=>desktop!.equestriaAck(event.player!,state)).catch(()=>{});
   else if(event.player)party.deliverEquestriaReward(event.player,event.event);
  }
  if((event.kind==='ended'||event.kind==='error')&&equestriaRunning?.session===event.session){equestriaRunning=null;void party.endGame();notify(event.message||'Returned from Equestria.');}
  if(event.kind==='input'&&equestriaRunning?.session===event.session&&event.book)party.equestriaInput(event.book);
  if(event.kind==='notice'&&event.message)notify(event.message);
  changed();
 });
 const prior=party.onGame;
 party.onGame=()=>{prior();if(equestriaRunning?.mode==='join'&&(!party.game||party.game.game!=='equestria'))void desktop!.stopGame();changed();};
}
export async function adventureSaveAction(action:string,id=''){
 if(equestriaRunning)throw Error('Finish your adventure before changing saves.');
 await queue.catch(()=>{});
 if(action==='equestria-new'){saveMenu='new';deleteId='';}
 else if(action==='equestria-saves'){saveMenu='load';deleteId='';}
 else if(action==='equestria-save-cancel'){saveMenu=null;deleteId='';}
 else if(action==='equestria-save-create'){
  const name=(document.querySelector('#equestria-save-name') as HTMLInputElement)?.value||'';
  await write(createAdventure(current(),chosenPony(),name));saveMenu=null;notify('New adventure saved. Ready to explore!');
 }else if(action==='equestria-save-load'){
  const slot=current().equestriaSaves?.find(s=>s.id===id);if(!slot||slot.pony!==chosenPony())throw Error('Choose a save for this pony.');
  await write(loadAdventure(current(),id));saveMenu=null;notify('Adventure loaded. Continue when you are ready.');
 }else if(action==='equestria-save-delete'){deleteId=id;saveMenu='load';}
 else if(action==='equestria-save-delete-confirm'){
  if(id!==deleteId)throw Error('Choose which adventure to delete.');
  await write(deleteAdventure(current(),id));deleteId='';notify('Adventure save deleted. Collected cards and pets are retained.');
 }else throw Error('Unknown save action.');
 changed();
}
function saveControls(save:Save){
 const pony=chosenPony(),slots=(save.equestriaSaves||[]).filter(s=>s.pony===pony).sort((a,b)=>b.updatedAt-a.updatedAt),selected=selectedAdventure(save,pony);
 if(equestriaRunning)return '';
 return `<div class="adventure-save-buttons"><button class="button secondary" data-action="equestria-new">New game</button><button class="button secondary" data-action="equestria-saves">Load game <small>(${slots.length})</small></button></div>${selected?`<p class="adventure-current-save">Selected: <strong>${e(selected.name)}</strong></p>`:'<p class="fine-print">Create an adventure for this pony, or start exploring.</p>'}
 ${saveMenu==='new'?`<section class="adventure-save-menu"><h3>New game</h3><label for="equestria-save-name">Adventure name</label><input id="equestria-save-name" maxlength="40" value="Adventure ${slots.length+1}"/><p class="fine-print">Starts fresh for this pony. Your other saves, cards and pets stay in your collection.</p><button class="button primary" data-action="equestria-save-create">Create save</button> <button class="text-button" data-action="equestria-save-cancel">Cancel</button></section>`:''}
 ${saveMenu==='load'?`<section class="adventure-save-menu"><h3>Load game</h3>${slots.length?slots.map(s=>`<article class="adventure-save-row"><strong>${e(s.name)}</strong><small>${new Date(s.updatedAt).toLocaleString()} · ${Object.keys(s.progress.books||{}).length}/7 books · ${s.progress.quests} deliveries</small>${deleteId===s.id?`<p>Delete this adventure’s progress? This cannot be undone.</p><button class="button danger" data-action="equestria-save-delete-confirm" data-save="${e(s.id)}">Delete save</button> <button class="text-button" data-action="equestria-saves">Keep save</button>`:`<button class="button secondary" data-action="equestria-save-load" data-save="${e(s.id)}">Load</button> <button class="text-button" data-action="equestria-save-delete" data-save="${e(s.id)}">Delete</button>`}</article>`).join(''):'<p>No adventures saved for this pony yet.</p>'}<button class="text-button" data-action="equestria-save-cancel">Close saves</button></section>`:''}`;
}
export async function launchEquestria(mode:'solo'|'host'|'join'){
 if(!desktop?.equestriaLaunch||!desktopProfile?.profile)throw Error('Open Equestria in the Ponyhaven desktop app.');
 if(equestriaRunning)throw Error('Finish the current adventure first.');
 if(!status.build)throw Error('Equestria files are missing. Extract the complete Ponyhaven folder again.');
 const pony=(document.querySelector('#equestria-pony') as HTMLSelectElement).value,fullscreen=(document.querySelector('#equestria-fullscreen') as HTMLInputElement).checked;
 await queue.catch(()=>{});
 if(mode==='host'&&!party.isHost)throw Error('Create a party before hosting Equestria.');
 if(equestriaRunning)throw Error('Finish the current adventure first.');
 equestriaRunning={mode,session:'',ready:false,player:''};changed();
 try{
  let slot=selectedAdventure(current(),pony);
  if(!slot){await write(createAdventure(current(),pony,'First adventure'));slot=selectedAdventure(current(),pony)!;}
  await write(loadAdventure(current(),slot.id));
  let join={};
  if(mode==='join'){
   const game=party.game;if(game?.game!=='equestria')throw Error('The host has not opened Equestria yet.');
   const profile=desktopProfile.profile,uid=profile.id+(slot.id==='legacy'?'':'_'+slot.id),port=await party.guestPort(status.build,{uid,displayName:profile.name,pony,state:structuredClone(current().equestria)});
   join={port,ticket:party.equestriaTicket!,session:game.session,build:{protocol:game.protocol,worldHash:game.worldHash,gameplayHash:game.gameplayHash}};
  }
  const result=await desktop.equestriaLaunch({pony,saveId:slot.id,fullscreen,mode,state:structuredClone(current().equestria),...join});
  if(mode==='host')await party.hostGame({game:'equestria',session:result.session,...result.build},result.port);
 }catch(error){await desktop.stopGame();await party.endGame();equestriaRunning=null;changed();throw error;}
}
export function renderEquestria(catalog:Catalog,save:Save){
 const selected=selectedAdventure(save,chosenPony());save={...save,equestria:selected?.progress||freshEquestria()};
 const pony=catalog.ponies.find(p=>p.id==='twilight-sparkle')!;
 const ready=save.equestria.chests.filter((_,i)=>Date.now()>=chestReadyAt(save.equestria,i)).length;
 const available=desktop&&status.engine&&status.world;
 const roster=[['twilight','Twilight Sparkle · unicorn'],['applejack','Applejack · earth pony'],['fluttershy','Fluttershy · pegasus'],['rarity','Rarity · unicorn'],['pinkiepie','Pinkie Pie · earth pony'],['rainbowdash','Rainbow Dash · pegasus'],['derpy','Derpy · pegasus'],['luna','Princess Luna · alicorn'],['trixie','Trixie · unicorn']];
 return `${worldTabs()}<div class="page-heading"><div><p class="eyebrow">A WHOLE KINGDOM OF LITTLE ADVENTURES</p><h1>Equestria</h1><p class="subheading">Bring your pony. Follow a ring trail. See who needs a friend.</p></div></div>
 <div class="arcade-layout equestria-layout"><section class="equestria-hero"><div class="equestria-stars" aria-hidden="true">✧　　✦　　✧</div><p class="eyebrow">PONYVILLE IS JUST THE BEGINNING</p><h2>Out the door.<br><em>Across Equestria.</em></h2><p>From Canterlot’s towers to Cloudsdale’s skies, there’s a whole world to wander together.</p><img src="${ponyImage(pony)}" alt="Twilight Sparkle"/><div class="equestria-towns"><span>Ponyville</span><span>Canterlot</span><span>Cloudsdale</span><span>Crystal Empire</span></div><div class="equestria-treasure"><strong>${ready} / 50</strong><span>treasures ready for you<br><small>One rare card or pet in every chest</small></span></div></section>
 <section class="arcade-launch"><h2>Your Equestria adventure</h2><label class="field-label" for="equestria-pony">Bring a pony</label><select id="equestria-pony" ${equestriaRunning?'disabled':''}>${roster.map(([id,label])=>`<option value="${id}" ${id===(localStorage.getItem(preferenceKey())||'twilight')?'selected':''}>${e(label)}</option>`).join('')}</select>${saveControls(save)}<p class="fine-print">Every pony can fly: jump again in the air. Pegasi use their wings, unicorns levitate and Fluttershy carries earth ponies.</p><label class="setting-toggle"><span>Open game fullscreen</span><input type="checkbox" id="equestria-fullscreen"/></label>
 ${equestriaRunning?`<div class="arcade-live" role="status"><strong>${equestriaRunning.ready?'Equestria is open':'Opening Equestria…'}</strong><p>${equestriaRunning.ready?'Your treasures and bits save as you play.':'Preparing your pony and the world.'}</p><button class="button secondary full" data-action="stop-arcade">${equestriaRunning.ready?'Finish & return':'Cancel launch'}</button></div>`:available?`<button class="button primary full" data-action="launch-equestria" data-mode="solo">${icon('spark')} ${selected?'Continue adventure':'Explore Equestria'}</button>`:desktop?`<div class="equestria-setup"><strong>Equestria files need restoring</strong><p>Extract the complete Ponyhaven folder again, keeping its resources folder beside the app.</p></div>`:'<p>Equestria is available in the Ponyhaven desktop app.</p>'}
 <div class="arcade-controls"><h3>A few helpful keys</h3><p><kbd>W A S D</kbd> Move · <kbd>Mouse</kbd> Camera<br><kbd>Space</kbd> Jump · press again in the air to fly<br><kbd>Left / right click</kbd> Attack / cast<br><kbd>1–7</kbd> Equip / put away a collected book<br><kbd>E</kbd> Interact · <kbd>I</kbd> World map · <kbd>V</kbd> Minimap<br><kbd>Esc</kbd> Pause menu</p><details class="controller-help"><summary>PS5 controller</summary><p>Left stick: move · Right stick: camera<br>Cross (×): jump · Square (□): melee / primary spell<br>Circle (○): throw / secondary spell<br>Triangle (△) or D-pad ↑: interact<br>L1 / R1: cycle unlocked books and unarmed<br>D-pad ←: world map · →: minimap<br>Options: pause</p><p class="fine-print">Connect by USB or Bluetooth before playing. Keyboard and mouse remain available for map menus.</p></details><p class="fine-print">Terrain is restored each time the world opens. Adventure progress saves automatically.</p></div></section></div>
 <div class="arcade-bottom"><section class="arcade-party"><h3>${icon('users')} A kingdom to share</h3>${party.room?`<p>Party code <strong class="party-code">${party.room.code}</strong> · ${party.friends.length+1} friends</p>${party.isHost?`<button class="button secondary" data-action="launch-equestria" data-mode="host" ${!available||equestriaRunning?'disabled':''}>Host Equestria</button>`:party.game?.game==='equestria'?`<button class="button primary" data-action="launch-equestria" data-mode="join" ${!available||equestriaRunning?'disabled':''}>Join Equestria</button>`:'<p>Your host can open Equestria when everyone is ready.</p>'}`:'<p>Create a party or enter a friend’s invite code. Up to eight ponies can explore together.</p>'}<button class="text-button" data-action="friends">${party.room?'Manage party':'Open party'}</button><p class="fine-print">${e(party.error||'Everyone has their own treasure rewards and quests. Keep Ponyhaven open while playing.')}</p></section>
 <section class="arcade-personal"><h3>Little discoveries, lasting treasures</h3><div><span><b>${save.equestria.quests}</b> deliveries</span><span><b>${save.equestria.rings.toLocaleString()}</b> rings found</span><span><b>${save.equestria.bits.toLocaleString()}</b> bits earned</span></div><p class="fine-print">10 bits per fresh ring · 150 bits per delivery.<br>Each chest refills 24 hours after you open it.</p></section>
 <section class="arcade-personal harmony-panel"><h3>Elements of Harmony</h3><div class="harmony-bars">${harmonyElements.map(el=>{const xp=save.equestria.harmony?.[el.id as HarmonyElement]||0,l=harmonyLevel(xp);return `<div class="harmony-bar"><span><b>${e(el.name)}</b> · level ${l.level}</span><span class="harmony-track" role="progressbar" aria-label="${e(el.name)} experience" aria-valuenow="${l.into}" aria-valuemax="${l.need}"><span style="width:${Math.round(l.into/l.need*100)}%;background:${el.colour}"></span></span><small>${l.into} / ${l.need}</small></div>`;}).join('')}</div><p class="fine-print">Resolve Friendship Emergencies and deliveries to grow each Element. Every new level earns a very rare card.</p></section></div>
 <p class="equestria-credit">Equestria 6 by <a href="https://www.planetminecraft.com/project/equestria-6/" target="_blank" rel="noopener">EagleCraft.fr</a>, with Brohoof.com builds and CaptainZepto’s landscape. World adapted for Ponyhaven under <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a>. Powered by Luanti.</p>`;
}
