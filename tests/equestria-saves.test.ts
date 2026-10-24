import test from 'node:test';
import assert from 'node:assert/strict';
import {freshSave,readSave} from '../src/game';
import {initialiseAdventures,createAdventure,loadAdventure,deleteAdventure,rememberAdventure,selectedAdventure} from '../src/equestria-saves';
test('legacy progress survives migration, distinct pony saves and reload',()=>{
 let save=freshSave();save.equestria.books={'3':true};save.equestria.rings=27;save.equestria.quests=2;
 save=initialiseAdventures(save,'luna',100);assert.equal(save.equestriaActive,'legacy');assert.equal(save.equestriaSaves![0].pony,'luna');
 save=createAdventure(save,'applejack','Orchard adventure','apple-one',200);assert.deepEqual(save.equestria.books,{});assert.equal(save.equestria.rings,0);
 save.equestria.books={'1':true};save.equestria.quests=7;rememberAdventure(save,300);
 save=createAdventure(save,'applejack','Another adventure','apple-two',400);assert.equal(save.equestria.quests,0);
 save=readSave(JSON.parse(JSON.stringify(save)))!;assert.ok(save);
 save=loadAdventure(save,'legacy',500);assert.deepEqual(save.equestria.books,{'3':true});assert.equal(save.equestria.rings,27);
 save=loadAdventure(save,'apple-one',600);assert.deepEqual(save.equestria.books,{'1':true});assert.equal(save.equestria.quests,7);
 assert.equal(selectedAdventure(save,'luna')!.id,'legacy');
});
test('deleting a save retains other adventures and the shared collection',()=>{
 let save=initialiseAdventures(freshSave(),'twilight');save.collection.test=4;save.petUnlocks.push({ponyId:'rarity',rarity:'Equestria',tier:4});
 save=createAdventure(save,'rarity','Castle trip','rarity-one');save=deleteAdventure(save,'rarity-one');
 assert.equal(save.equestriaActive,undefined);assert.equal(save.equestriaSaves!.length,1);assert.equal(save.collection.test,4);assert.equal(save.petUnlocks.length,1);assert.ok(readSave(save));
 assert.throws(()=>loadAdventure(save,'rarity-one'));assert.throws(()=>createAdventure(save,'invalid','Oops'));
 const broken=structuredClone(save);broken.equestriaActive='missing';assert.equal(readSave(broken),null);
 broken.equestriaActive='legacy';broken.equestriaSaves![0].progress.books={'9':true};assert.equal(readSave(broken),null);
});
