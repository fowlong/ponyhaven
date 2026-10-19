import type { ArcadeProgress, Save } from './types';
import type { ArcadeEvent } from './desktop';

export function freshArcade(): ArcadeProgress {
  const record=()=>({bestScore:0,rings:0,bits:0,finishes:0,bestTimes:{}});
  return {adventure:record(),ponykart:record(),sessions:[]};
}
export function validArcade(a: ArcadeProgress) {
  const count=(n: unknown)=>Number.isSafeInteger(n) && (n as number)>=0 && (n as number)<=1e12;
  return a && ['adventure','ponykart'].every((k)=>{
    const r=a[k as 'adventure'|'ponykart'];
    return r && [r.bestScore,r.rings,r.bits,r.finishes].every(count) && r.bestTimes &&
      Object.keys(r.bestTimes).length<=2048 && Object.values(r.bestTimes).every((v)=>count(v) && v>0);
  }) && Array.isArray(a.sessions) && a.sessions.length<=20 && a.sessions.every((s)=>
    /^[a-f0-9-]{36}$/.test(s.id) && ['adventure','ponykart'].includes(s.game) && count(s.rings) && count(s.laps) && typeof s.finished==='boolean');
}
/** Cumulative engine counters make repeated file reads and late events idempotent. */
export function arcadeReward(save: Save, event: ArcadeEvent): { save: Save; bits: number; xp: number } {
  if(event.type!=='progress' || !['adventure','ponykart'].includes(event.game) ||
    !/^[a-f0-9-]{36}$/.test(event.session) ||
    !['rings','score','map','elapsed','laps'].every((k)=>Number.isInteger(event[k as keyof ArcadeEvent]) &&
      Number(event[k as keyof ArcadeEvent])>=0 && Number(event[k as keyof ArcadeEvent])<=1e9)) return {save,bits:0,xp:0};
  const previous=save.arcade.sessions.find((s)=>s.id===event.session);
  if(previous && previous.game===event.game && event.rings!<=previous.rings && Math.min(event.laps!,3)<=previous.laps &&
    (!event.finished || previous.finished) && event.score!<=save.arcade[event.game].bestScore)return {save,bits:0,xp:0};
  const next=structuredClone(save), a=next.arcade;
  let session=a.sessions.find((s)=>s.id===event.session);
  if(session && session.game!==event.game)return {save,bits:0,xp:0};
  if(!session) {
    session={id:event.session,game:event.game,rings:0,laps:0,finished:false};
    a.sessions.push(session);a.sessions=a.sessions.slice(-20);
  }
  const r=a[event.game], rings=Math.max(0,event.rings!-session.rings);
  const laps=Math.max(0,Math.min(event.laps!,3)-session.laps);
  let bits=event.game==='adventure'?rings*10:laps*50;
  if(event.finished && !session.finished) {
    session.finished=true;r.finishes++;bits+=event.game==='ponykart'?200:100;
    const course=event.pack?`${event.pack}:${event.map}`:String(event.map);
    if(event.elapsed!>0) r.bestTimes[course]=Math.min(r.bestTimes[course]||Infinity,event.elapsed!);
  }
  session.rings=Math.max(session.rings,event.rings!);
  session.laps=Math.max(session.laps,Math.min(event.laps!,3));
  r.bestScore=Math.max(r.bestScore,event.score!);
  r.rings+=rings;r.bits+=bits;next.coins+=bits;
  return {save:next,bits,xp:bits?Math.min(12,Math.max(1,Math.floor(bits/50))):0};
}
