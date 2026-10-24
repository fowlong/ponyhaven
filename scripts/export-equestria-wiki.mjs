// Deterministic Equestria wiki for the Adventure tab, generated from the game's
// own data: friendship.json, encounters.json, locations.json, ponies.json and
// the pony kinds in adventure.lua. Same inputs always give the same file.
// Run after changing any of them: node scripts/export-equestria-wiki.mjs
import fs from 'node:fs/promises';
const mod='equestria/game/mods/ponyhaven',bundled='native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const friendship=await read(mod+'/friendship.json');
const encounters=await read(bundled+'/encounters.json');
const locations=await read('native/equestria/world/locations.json');
const sheets=await read(bundled+'/ponies.json');
const lua=await fs.readFile(mod+'/adventure.lua','utf8');
const kinds=Object.fromEntries([...lua.match(/local kinds=\{([^}]*)\}/)[1].matchAll(/(\w+)='(\w+)'/g)].map(m=>[m[1],m[2]]));
const names={twilight:'Twilight Sparkle',applejack:'Applejack',fluttershy:'Fluttershy',rarity:'Rarity',pinkiepie:'Pinkie Pie',rainbowdash:'Rainbow Dash',derpy:'Derpy',luna:'Princess Luna',trixie:'Trixie'};
const flight={pegasus:'Flies on their own wings.',unicorn:'Levitates with a soft magical glow, in a prone jump pose.',earth:'Fluttershy swoops in and carries them (short cooldown between lifts).'};
const shots={pegasus:'cloud puff',unicorn:'rainbow orb',earth:'dirt clod'};
const element=id=>friendship.elements.find(e=>e.id===id).name;
const town=id=>locations.towns.find(t=>t.id===id)?.name||id;
const spells=[
 ['Risier','Upward burst','Directional dash'],['Fiera','Fire burst / burning area','Explosive fireball'],['Disperim','Repulsion','Swap with a targeted enemy'],
 ['Sanium','Healing','Temporary shield'],['Expol','Explosive projectile','Pulling singularity / blast'],['Flurra','Slowing snowball','Icicle field'],['Fulst','Lightning bolt','Electric orb trap']];
const pages=[
 {id:'getting-started',title:'Getting started',sections:[
  {heading:'Controls',rows:[['Move / camera','WASD / mouse','Left / right stick'],['Jump · fly','Space, then Space again in the air (hold to climb)','Cross'],['Melee / primary spell','Left click','Square'],['Throw / secondary spell','Right click','Circle'],['Interact · talk','E','Triangle or D-pad up'],['Quest journal','Tab','—'],['Books','1–7','L1 / R1'],['World map / minimap','I / V','D-pad left / right'],['Pause','Escape','Options']],columns:['Action','Keyboard / mouse','Controller']},
  {heading:'Saving',text:'Progress saves automatically to the selected adventure. Rings, deliveries, treasures, books, bosses and Elements of Harmony experience sync to your Ponyhaven profile. Terrain damage resets when a solo or hosted world opens.'}]},
 {id:'ponies',title:'Ponies and flight',sections:[
  {heading:'Every pony can fly',text:'Jump, release, then jump again in the air to fly. Landing or entering water ends flight.'},
  {heading:'Roster',columns:['Pony','Kind','Flight','Right click'],rows:Object.keys(names).filter(id=>sheets[id]).map(id=>[names[id],id==='luna'?'Alicorn':kinds[id][0].toUpperCase()+kinds[id].slice(1),flight[kinds[id]],shots[kinds[id]]])}]},
 {id:'elements',title:'Elements of Harmony',sections:[
  {heading:'Experience',text:'Each Element has its own experience bar, shown in the quest journal (Tab) and on the Equestria page. Level 2 needs 300 experience, and each level after needs 150 more. Every new level earns one very rare card for your collection.'},
  {heading:'The six Elements',columns:['Element','Bearer','What earns it'],rows:friendship.elements.map(e=>[e.name,e.bearer,e.about])},
  {heading:'Experience sources',columns:['Source','Experience'],rows:[['Friendship Emergency','40 to its first Element, 20 to its second, plus 30 (heartfelt choice) or 15 to the Element of your choice'],['Delivery step','10 to the quest theme\'s Element'],['Finished quest chain','15 bonus to the theme\'s Element']]},
  {heading:'Delivery themes',columns:['Quest theme','Element'],rows:Object.entries(friendship.questThemes).sort().map(([t,e])=>[t[0].toUpperCase()+t.slice(1),element(e)])}]},
 {id:'emergencies',title:'Friendship Emergencies',sections:[
  {heading:'How they work',text:'Every few minutes a town pony needs urgent help. A big pink heart marks the way. Hear the troubled pony out, hear the other side, find two clues, discover the twist, then choose how to help. Every choice resolves the emergency; the one that best honours the twist earns the most experience. Only one emergency is active at a time, and you can give one up from the journal: another appears after a short while. Each resolution also earns 300 bits.'},
  {heading:'Kinds of emergency',columns:['Kind','What happens','Twist'],rows:friendship.archetypes.map(a=>[a.name,a.about,a.twist])},
  {heading:'Emergencies',columns:['Emergency','Kind','Elements','What happens'],rows:friendship.emergencies.map(s=>[s.title,friendship.archetypes.find(a=>a.id===s.archetype).name,s.elements.map(element).join(' · '),s.event.replaceAll('{A}','a pony').replaceAll('{B}','a friend').replaceAll('{town}','town')])}]},
 {id:'quests',title:'Quests and treasure',sections:[
  {heading:'Quest chains',text:'Town ponies with a gold ! offer quest chains of two to four deliveries. Each delivered step earns 150 bits and Element experience. Ponies talk in speech bubbles; the journal keeps recent conversations.'},
  {heading:'Rings and treasure',text:`Rings appear each day and give 10 bits each. ${locations.chests.length} treasure chests each give one rare card or a new pet, and refill 24 hours after opening.`},
  {heading:'Town ponies',columns:['Pony','Town'],rows:[...locations.npcs].sort((a,b)=>a.town.localeCompare(b.town)||a.name.localeCompare(b.name)).map(n=>[n.name,town(n.town)])}]},
 {id:'magic',title:'Spellbooks',sections:[
  {heading:'The seven books',text:'Seven unique floating spellbooks rest at fixed, widely scattered places, marked in purple on the world map. Press 1–7 to equip a collected book; it replaces both mouse attacks.'},
  {heading:'Spells',columns:['Book','Primary','Secondary'],rows:spells}]},
 {id:'bosses',title:'World bosses',sections:[
  {heading:'Bosses',text:'Giant world bosses use telegraphed attacks. Defeating one adds it to your virtual pets.'},
  {heading:'Roster',columns:['Boss','Attacks'],rows:[...encounters.bosses].sort((a,b)=>a.name.localeCompare(b.name)).map(b=>[b.name,b.moves.join(' · ')])}]},
 {id:'world',title:'The world',sections:[
  {heading:'Towns',columns:['Town','Town ponies'],rows:locations.towns.map(t=>[t.name,String(locations.npcs.filter(n=>n.town===t.id).length)])},
  {heading:'Getting around',text:'Press I for the world map and travel between towns. Teleporters join distant areas. Town ponies keep simple daily routines and stand still when you come to talk.'}]},
];
// Element names and colours also drive the experience bars on the Equestria page.
const elements=friendship.elements.map(({id,name,colour,bearer})=>({id,name,colour,bearer}));
await fs.writeFile('src/equestria-wiki.json',JSON.stringify({elements,pages},null,1)+'\n');
console.log('Exported Equestria wiki:',pages.length,'pages,',pages.reduce((n,p)=>n+p.sections.length,0),'sections.');
