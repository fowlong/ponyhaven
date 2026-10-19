import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, readSave } from '../src/game';
import { arcadeReward } from '../src/arcade-progress';
import type { ArcadeEvent } from '../src/desktop';
const event:ArcadeEvent={type:'progress',game:'adventure',session:'00000000-0000-0000-0000-000000000001',map:1,rings:4,score:400,elapsed:350,laps:0,finished:false};
test('fresh rings pay once, including repeated and out-of-order snapshots',()=>{
  const a=arcadeReward(freshSave('Friend'),event);
  assert.equal(a.bits,40);
  assert.equal(arcadeReward(a.save,event).bits,0);
  const old=arcadeReward(a.save,{...event,rings:2});
  assert.equal(old.bits,0);
  assert.equal(arcadeReward(old.save,{...event,rings:5}).bits,10);
});
test('race laps and finish pay once and preserve fastest course time',()=>{
  let save=freshSave('Friend');
  const race={...event,game:'ponykart',laps:3,finished:true,elapsed:3500} as ArcadeEvent;
  let r=arcadeReward(save,race);assert.equal(r.bits,350);
  assert.equal(arcadeReward(r.save,race).bits,0);
  r=arcadeReward(r.save,{...race,session:'00000000-0000-0000-0000-000000000002',elapsed:5000});
  assert.equal(r.save.arcade.ponykart.bestTimes['1'],3500);
  assert.equal(r.save.arcade.ponykart.finishes,2);
});
test('old profiles gain arcade defaults and malformed events pay nothing',()=>{
  const save=freshSave('Friend'),old=structuredClone(save) as any;delete old.arcade;
  assert.equal(readSave(old)!.arcade.adventure.bits,0);
  for(const bad of [{rings:-1},{elapsed:NaN},{session:'../escape'},{score:Infinity}])
    assert.equal(arcadeReward(save,{...event,...bad}).save,save);
});
