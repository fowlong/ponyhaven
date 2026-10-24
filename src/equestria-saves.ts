import type {Save} from './types';
import {freshEquestria,validEquestria,type EquestriaProgress} from './equestria-state';
export const adventurePonies=['twilight','applejack','fluttershy','rarity','derpy','luna','trixie','pinkiepie','rainbowdash'];
export interface AdventureSave {id:string;pony:string;name:string;createdAt:number;updatedAt:number;progress:EquestriaProgress}
export function validAdventureSaves(save:Save){
 if(save.equestriaSaves===undefined)return save.equestriaActive===undefined;
 if(!Array.isArray(save.equestriaSaves)||save.equestriaSaves.length>100)return false;
 const ids=new Set<string>();
 for(const slot of save.equestriaSaves){
  if(!slot||typeof slot.id!=='string'||!/^[a-zA-Z0-9_-]{1,40}$/.test(slot.id)||ids.has(slot.id)||!adventurePonies.includes(slot.pony)||typeof slot.name!=='string'||!slot.name.trim()||slot.name.length>40||![slot.createdAt,slot.updatedAt].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=8.64e15)||!validEquestria(slot.progress))return false;
  ids.add(slot.id);
 }
 return save.equestriaActive===undefined||ids.has(save.equestriaActive);
}
export function rememberAdventure(save:Save,now=Date.now()){
 const slot=save.equestriaSaves?.find(s=>s.id===save.equestriaActive);
 if(slot){slot.progress=structuredClone(save.equestria);slot.updatedAt=now;}
 return save;
}
export function initialiseAdventures(save:Save,pony:string,now=Date.now()){
 if(save.equestriaSaves!==undefined)return save;
 const next=structuredClone(save);next.equestriaActive='legacy';
 next.equestriaSaves=[{id:'legacy',pony:adventurePonies.includes(pony)?pony:'twilight',name:'Original adventure',createdAt:save.createdAt,updatedAt:now,progress:structuredClone(save.equestria)}];
 return next;
}
export function selectedAdventure(save:Save,pony:string){
 const slots=save.equestriaSaves?.filter(s=>s.pony===pony)||[];
 return slots.find(s=>s.id===save.equestriaActive)||slots.sort((a,b)=>b.updatedAt-a.updatedAt)[0];
}
export function createAdventure(save:Save,pony:string,name:string,id:string=crypto.randomUUID(),now=Date.now()){
 if(!adventurePonies.includes(pony)||!name.trim()||name.trim().length>40)throw Error('Choose a pony and a save name of up to 40 characters.');
 if((save.equestriaSaves?.length||0)>=100)throw Error('Delete an adventure to make room for a new save.');
 if(!/^[a-zA-Z0-9_-]{1,40}$/.test(id)||save.equestriaSaves?.some(s=>s.id===id))throw Error('Invalid adventure save.');
 const next=rememberAdventure(structuredClone(save),now),progress=freshEquestria();
 (next.equestriaSaves||=[]).push({id,pony,name:name.trim(),createdAt:now,updatedAt:now,progress});next.equestriaActive=id;next.equestria=structuredClone(progress);return next;
}
export function loadAdventure(save:Save,id:string,now=Date.now()){
 const next=rememberAdventure(structuredClone(save),now),slot=next.equestriaSaves?.find(s=>s.id===id);if(!slot)throw Error('This adventure save is no longer available.');
 slot.updatedAt=now;next.equestriaActive=id;next.equestria=structuredClone(slot.progress);return next;
}
export function deleteAdventure(save:Save,id:string){
 const next=rememberAdventure(structuredClone(save));if(!next.equestriaSaves?.some(s=>s.id===id))throw Error('This adventure save is no longer available.');
 next.equestriaSaves=next.equestriaSaves.filter(s=>s.id!==id);
 if(next.equestriaActive===id){delete next.equestriaActive;next.equestria=freshEquestria();}return next;
}
