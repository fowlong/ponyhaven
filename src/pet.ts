import type { BackgroundStage, Behavior, Pony, PonyEffect, Presence } from './types';
import { projectStage } from './backgrounds';
import { escape, icon } from './icons';
import { ponyFinish } from './rarity';

export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
export function ponyImage(pony: Pony, still = false): string {
  return asset(
    still && pony.preview
      ? pony.preview
      : (pony.behaviors.find((b) => b.name === pony.idle) || pony.behaviors[0]).right,
  );
}
const between = (min: number, max: number) => min + Math.random() * (max - min);
type Timer = ReturnType<typeof setTimeout>;
const transformationPattern =
  /crystalli[sz]|crystal|breezi|galla|gala|dress|outfit|costume|fashion|wonderbolt|starswirl|farm(?:_|pony)|socks|armou?r|seapony|mermaid|batpony/i;
export const transformations = (pony: Pony) =>
  pony.behaviors.filter(
    (b) =>
      transformationPattern.test(b.name) && !b.next && !b.followTarget && !/drag|walk|start/i.test(b.name),
  );

export class Meadow {
  x = 45;
  private timer: Timer | undefined;
  private bubbleTimer: Timer | undefined;
  private guestTimer: Timer | undefined;
  private effectTimers = new Set<Timer>();
  private careTimers = new Set<Timer>();
  private direction: 'right' | 'left' = 'right';
  private destroyed = false;
  private recent: string[] = [];
  private guests: Presence[] = [];
  private positions = new Map<string, number>();
  private drawing: Timer | undefined;
  private bathOn = false;
  private showering = false;
  private lastWash = 0;
  private controller = new AbortController();
  private dirtCanvas = document.createElement('canvas');
  private water = document.createElement('span');
  private washGlowTimer: Timer | undefined;
  private effects: HTMLElement;
  private cameos: HTMLElement;
  private careEffects: HTMLElement;
  private resizeObserver: ResizeObserver;
  private walkMin = 18;
  private walkMax = 82;

  constructor(
    private root: HTMLElement,
    private pony: Pony,
    private allPonies: Pony[],
    private reduced: boolean,
    private getDirt: () => number = () => 0,
    private onWash: () => void = () => {},
    private stage?: BackgroundStage,
  ) {
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.root);
    this.layout();
    this.effects = this.layer('temporary-effects');
    this.cameos = this.layer('interaction-cameos');
    this.careEffects = this.layer('care-effects');
    this.dirtCanvas.className = 'pet-dirt';
    this.dirtCanvas.setAttribute('aria-hidden', 'true');
    this.root.append(this.dirtCanvas);
    this.water.className = 'water-cursor';
    this.water.setAttribute('aria-hidden', 'true');
    this.water.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i>';
    this.root.append(this.water);
    const signal = this.controller.signal;
    this.root.addEventListener(
      'load',
      (ev) => {
        const img = ev.target;
        if (img instanceof HTMLImageElement && img.matches('#pet-sprite, .friend-pony > img')) this.layout();
      },
      { capture: true, signal },
    );
    this.root.addEventListener(
      'pointerdown',
      (ev) => {
        if (!this.bathOn || (ev.target as HTMLElement).closest('button:not(#pet-wrap)')) return;
        ev.preventDefault();
        this.showering = true;
        this.root.setPointerCapture(ev.pointerId);
        this.waterAt(ev);
      },
      { signal },
    );
    this.root.addEventListener(
      'pointermove',
      (ev) => {
        if (this.bathOn) this.waterAt(ev);
      },
      { signal },
    );
    this.root.addEventListener(
      'pointerup',
      () => {
        this.showering = false;
      },
      { signal },
    );
    this.root.addEventListener(
      'pointercancel',
      () => {
        this.showering = false;
      },
      { signal },
    );
    this.drawDirt();
    this.run(this.behavior(pony.idle), 0, 4200);
    this.scheduleGuests();
  }
  private bounded(n: number) {
    return Math.max(this.walkMin, Math.min(this.walkMax, n));
  }
  private layout() {
    const rect = this.root.getBoundingClientRect();
    const geometry = projectStage(this.stage, rect.width, rect.height);
    this.root.style.setProperty('--floor', `${geometry.floor}px`);
    this.root.style.setProperty('--sprite-scale', String(geometry.scale));
    this.root.style.setProperty('--scene-focus', `${geometry.focusX}%`);
    this.root.dataset.floor = String(geometry.floor);
    const images = [...this.root.querySelectorAll<HTMLImageElement>('#pet-sprite, .friend-pony > img')];
    for (const img of images) {
      if (!img.naturalWidth || !img.naturalHeight) continue;
      const width = img.naturalWidth * geometry.scale;
      const height = img.naturalHeight * geometry.scale;
      // Preserve the source aspect ratio when a large creature or outfit needs a viewport cap.
      const fit = Math.min(
        1,
        Math.min(innerWidth * 0.7, 420) / width,
        Math.min(geometry.floor - 48, 280) / height,
      );
      img.style.width = `${width * fit}px`;
      img.style.height = `${height * fit}px`;
    }
    const halfBody = Math.max(...images.map((img) => img.getBoundingClientRect().width)) / 2;
    const edge = Math.min(48, ((halfBody + 8) / rect.width) * 100);
    this.walkMin = Math.max(geometry.min, edge);
    this.walkMax = Math.min(geometry.max, 100 - edge);
    this.root.dataset.walkMin = String(this.walkMin);
    this.root.dataset.walkMax = String(this.walkMax);
    for (const actor of this.root.querySelectorAll<HTMLElement>('#pet-wrap, .friend-pony')) {
      const x = this.bounded(parseFloat(actor.style.left) || 45);
      const box = actor.getBoundingClientRect();
      const current = ((box.left + box.width / 2 - rect.left) / rect.width) * 100;
      if (Math.abs(current - this.bounded(current)) > 0.1) {
        const duration = actor.style.getPropertyValue('--move-time');
        actor.style.setProperty('--move-time', '0s');
        actor.style.transition = 'none';
        actor.style.left = `${this.bounded(current)}%`;
        void actor.offsetWidth;
        actor.style.setProperty('--move-time', duration || '2.4s');
        actor.style.transition = '';
      }
      actor.style.left = `${x}%`;
      if (actor.id === 'pet-wrap') this.x = x;
      else if (actor.dataset.uid) this.positions.set(actor.dataset.uid, x);
    }
  }
  private layer(id: string) {
    const el = document.createElement('div');
    el.id = id;
    el.className = 'meadow-effect-layer';
    el.setAttribute('aria-hidden', 'true');
    this.root.append(el);
    return el;
  }
  private behavior(name: string) {
    return (
      this.pony.behaviors.find((b) => b.name.toLowerCase() === name.toLowerCase()) || this.pony.behaviors[0]
    );
  }
  private later(set: Set<Timer>, callback: () => void, ms: number) {
    const timer = setTimeout(() => {
      set.delete(timer);
      if (!this.destroyed) callback();
    }, ms);
    set.add(timer);
    return timer;
  }
  private clear(set: Set<Timer>) {
    for (const timer of set) clearTimeout(timer);
    set.clear();
  }
  private clearBehavior() {
    clearTimeout(this.timer);
    this.clear(this.effectTimers);
    this.effects.replaceChildren();
  }
  private clearCare() {
    this.clear(this.careTimers);
    this.careEffects.replaceChildren();
    this.root.classList.remove('transformed');
    delete this.root.dataset.care;
  }
  private show(b: Behavior) {
    const img = this.root.querySelector<HTMLImageElement>('#pet-sprite');
    this.root.dataset.behavior = b.name;
    if (img) {
      img.src = this.reduced
        ? asset(
            (this.direction === 'right' ? b.previewRight : b.previewLeft) ||
              this.pony.preview ||
              b[this.direction],
          )
        : asset(b[this.direction]);
      img.alt = `${this.pony.name} · ${b.name.replaceAll('_', ' ')}`;
    }
  }
  private freeze() {
    const wrap = this.root.querySelector<HTMLElement>('#pet-wrap');
    if (!wrap) return;
    const scene = this.root.getBoundingClientRect(),
      rect = wrap.getBoundingClientRect();
    this.x = this.bounded(((rect.left + rect.width / 2 - scene.left) / scene.width) * 100);
    wrap.style.setProperty('--move-time', '0s');
    wrap.style.left = this.x + '%';
    void wrap.offsetWidth;
  }
  private travel(x: number, seconds = 2.4) {
    if (this.reduced) return;
    this.freeze();
    this.direction = x >= this.x ? 'right' : 'left';
    this.x = this.bounded(x);
    const wrap = this.root.querySelector<HTMLElement>('#pet-wrap');
    if (wrap) {
      wrap.style.setProperty('--move-time', `${seconds}s`);
      wrap.style.left = `${this.x}%`;
    }
  }
  private run(b: Behavior, depth = 0, forcedDuration?: number, target?: number) {
    if (this.destroyed) return;
    this.clearBehavior();
    this.freeze();
    // Linked animation parts keep their original timing, with a cap for desktop-length scenes.
    const duration =
      forcedDuration ??
      (b.next || depth > 0
        ? Math.max(700, Math.min(12000, between(b.min, b.max) * 1000))
        : between(4800, 7600));
    if (b.speed > 0 && !b.followTarget)
      this.travel(target ?? between(this.walkMin, this.walkMax), duration / 1000);
    this.show(b);
    this.recent = [b.name, ...this.recent].slice(0, 2);
    if (!this.reduced)
      for (const effect of this.pony.effects || [])
        if (effect.behavior.toLowerCase() === b.name.toLowerCase()) this.addEffect(effect, duration);
    if (!this.reduced || forcedDuration)
      this.timer = setTimeout(() => {
        if (this.reduced) {
          this.clearCare();
          this.show(this.behavior(this.pony.idle));
          return;
        }
        const next =
          b.next && depth < 6
            ? this.pony.behaviors.find((v) => v.name.toLowerCase() === b.next!.toLowerCase())
            : null;
        if (next && !next.followTarget && !transformationPattern.test(next.name)) this.run(next, depth + 1);
        else this.ambient();
      }, duration);
  }
  private ambient() {
    if (this.destroyed) return;
    this.clearCare();
    this.cameos.replaceChildren();
    let eligible = this.pony.behaviors.filter(
      (b) =>
        b.chance > 0 &&
        !b.skip &&
        !b.followTarget &&
        !transformationPattern.test(b.name) &&
        !/Dragged|Sleep/i.test(b.movement) &&
        !this.recent.includes(b.name),
    );
    if (!eligible.length) eligible = [this.behavior(this.pony.idle), this.behavior(this.pony.walk)];
    // Flatten extreme desktop probabilities so short visits still show varied animations.
    let roll = Math.random() * eligible.reduce((n, b) => n + Math.sqrt(Math.max(0.001, b.chance)), 0);
    this.run(eligible.find((b) => (roll -= Math.sqrt(Math.max(0.001, b.chance))) <= 0) || eligible[0]);
  }
  private addEffect(effect: PonyEffect, behaviorDuration: number) {
    const spawn = () => {
      if (this.effects.children.length >= 10) return;
      const img = document.createElement('img');
      img.className = 'native-effect';
      img.alt = '';
      img.dataset.effect = effect.name;
      img.src = asset(effect[this.direction]);
      const direction = this.direction;
      const placement = direction === 'right' ? effect.placementRight : effect.placementLeft;
      const centering = direction === 'right' ? effect.centeringRight : effect.centeringLeft;
      const anchor = (value: string) => {
        const v = value.toLowerCase();
        return {
          x: v.includes('left') ? 0 : v.includes('right') ? 1 : 0.5,
          y: v.includes('top') ? 0 : v.includes('bottom') ? 1 : 0.5,
        };
      };
      const attach = anchor(placement),
        center = anchor(centering);
      img.style.transform = `translate(${-center.x * 100}%,${-center.y * 100}%)`;
      const position = () => {
        const sprite = this.root.querySelector('#pet-sprite')!.getBoundingClientRect(),
          scene = this.root.getBoundingClientRect();
        img.style.left = `${sprite.left - scene.left + sprite.width * attach.x}px`;
        img.style.top = `${sprite.top - scene.top + sprite.height * attach.y}px`;
      };
      this.effects.append(img);
      position();
      const follow = () => {
        if (!img.isConnected) return;
        position();
        this.later(this.effectTimers, follow, 100);
      };
      if (effect.follow) follow();
      this.later(
        this.effectTimers,
        () => img.remove(),
        effect.duration > 0 ? Math.min(20000, effect.duration * 1000) : behaviorDuration,
      );
    };
    spawn();
    if (effect.repeat > 0) {
      const repeat = () => {
        spawn();
        this.later(this.effectTimers, repeat, Math.max(650, effect.repeat * 1000));
      };
      this.later(this.effectTimers, repeat, Math.max(650, effect.repeat * 1000));
    }
  }
  move(x: number) {
    if (this.destroyed) return;
    this.clearCare();
    this.cameos.replaceChildren();
    this.run(this.behavior(this.pony.walk), 0, 2600, x);
  }
  interact(action: string) {
    if (this.destroyed) return;
    this.clearCare();
    this.cameos.replaceChildren();
    this.root.dataset.care = action;
    if (action === 'transform') {
      const options = transformations(this.pony);
      if (!options.length) return;
      const choice = options[Math.floor(Math.random() * options.length)];
      this.run(choice, 0, 10000);
      this.root.classList.add('transformed');
      this.later(this.careTimers, () => this.root.classList.remove('transformed'), 10000);
      this.say(choice.name.replaceAll('_', ' ') + ' · 10 seconds of magic!');
      return;
    }
    const patterns: Record<string, RegExp> = {
      feed: /eat|munch|chew|drink/i,
      play: /gallop|run|trot|walk/i,
      rest: /sleep|nap/i,
      pet: /happy|smile|blush|wink|blink|stand/i,
    };
    const b =
      this.pony.behaviors.find((b) => patterns[action]?.test(b.name) && !b.next) ||
      (action === 'rest' ? this.pony.behaviors.find((b) => b.movement === 'Sleep') : null) ||
      this.behavior(this.pony.idle);
    if (action === 'play' && !this.reduced) {
      const start = this.x;
      const run =
        this.pony.behaviors.find((b) => /gallop|run/i.test(b.name)) || this.behavior(this.pony.walk);
      const lap = (x: number) => {
        this.run(run, 0, 1800, x);
      };
      lap(this.bounded(start + 22));
      this.later(this.careTimers, () => lap(this.bounded(start - 15)), 1600);
      this.later(this.careTimers, () => lap(start), 3200);
    } else this.run(b, 0, action === 'rest' ? 14000 : 5500);
    this.careEffects.innerHTML = `<span class="care-prop care-${action}" style="left:${this.x}%">${action === 'brush' ? icon('brush') + '<i>✧</i>' : action === 'feed' ? icon('apple') + '<i>♡</i>' : action === 'rest' ? '<i>z</i><i>z</i><i>Z</i>' : action === 'play' ? '<i class="play-ball"></i><i>✧</i>' : '<i>♡</i><i>♡</i>'}</span>`;
    this.later(this.careTimers, () => this.careEffects.replaceChildren(), action === 'rest' ? 14000 : 5400);
    this.say(
      {
        brush: 'Freshly brushed, fluffy and clean. ✧',
        feed: 'A little treat, a lot of happiness. ♡',
        play: 'Happy hooves! Let’s run around. ✧',
        rest: 'Time for a cozy little rest…',
        pet: 'Friendship looks good on us. ♡',
      }[action] || 'Hello, friend!',
    );
  }
  say(text: string) {
    const bubble = this.root.querySelector<HTMLElement>('#pet-bubble');
    if (!bubble) return;
    bubble.textContent = text;
    bubble.classList.add('visible');
    clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => bubble.classList.remove('visible'), 4500);
  }
  friends(friends: Presence[]) {
    this.guests = friends.slice(0, 4);
    for (const uid of this.positions.keys())
      if (!this.guests.some((g) => g.uid === uid)) this.positions.delete(uid);
    const el = this.root.querySelector<HTMLElement>('#friend-sprites');
    if (!el) return;
    for (const child of Array.from(el.children))
      if (!this.guests.some((g) => g.uid === (child as HTMLElement).dataset.uid)) child.remove();
    for (const f of this.guests) {
      const p = this.allPonies.find((p) => p.id === f.ponyId);
      if (!p) continue;
      let actor = Array.from(el.children).find((c) => (c as HTMLElement).dataset.uid === f.uid) as
        HTMLElement | undefined;
      if (actor && actor.dataset.pony !== p.id) {
        actor.remove();
        actor = undefined;
      }
      if (!actor) {
        actor = document.createElement('div');
        actor.dataset.uid = f.uid;
        actor.dataset.pony = p.id;
        actor.className = `friend-pony rarity-${f.tier}`;
        actor.style.setProperty('--aura', p.color);
        actor.innerHTML = `${ponyFinish()}<img src="${ponyImage(p, this.reduced)}" alt="${escape(p.name)}"/><span class="friend-label"></span>`;
        el.append(actor);
      }
      actor.className = `friend-pony rarity-${f.tier}`;
      actor.querySelector('.friend-label')!.textContent = f.uid.startsWith('npc:')
        ? `${p.name} · NPC visitor`
        : `${f.name} ♡`;
      const old = this.positions.get(f.uid);
      const x = this.bounded(f.uid.startsWith('npc:') ? (old ?? f.x) : f.x);
      if (!f.uid.startsWith('npc:') && old !== undefined && Math.abs(x - old) > 2 && !this.reduced) {
        const walk = p.behaviors.find((b) => b.name === p.walk) || p.behaviors[0];
        const direction = x > old ? 'right' : 'left';
        actor.dataset.direction = direction;
        actor.dataset.walkUntil = String(Date.now() + 3000);
        actor.querySelector<HTMLImageElement>('img')!.src = asset(walk[direction]);
      }
      this.positions.set(f.uid, x);
      actor.style.left = `${this.bounded(x)}%`;
    }
    this.layout();
  }
  private scheduleGuests() {
    if (this.destroyed || this.reduced) return;
    this.guestTimer = setTimeout(() => {
      for (const guest of this.guests) {
        const p = this.allPonies.find((p) => p.id === guest.ponyId);
        if (!p) continue;
        const el = Array.from(this.root.querySelectorAll<HTMLElement>('.friend-pony')).find(
          (el) => el.dataset.uid === guest.uid,
        );
        if (!el) continue;
        if (!guest.uid.startsWith('npc:') && Number(el.dataset.walkUntil) > Date.now()) continue;
        const walk = guest.uid.startsWith('npc:') && Math.random() < 0.65;
        const old = this.positions.get(guest.uid) || guest.x;
        const target = walk ? this.bounded(between(this.x - 20, this.x + 25)) : old;
        const b = p.behaviors.find((b) => b.name === (walk ? p.walk : p.idle)) || p.behaviors[0];
        const direction =
          target === old
            ? el.dataset.direction === 'left'
              ? 'left'
              : 'right'
            : target > old
              ? 'right'
              : 'left';
        el.dataset.direction = direction;
        el.querySelector<HTMLImageElement>('img')!.src = asset(b[direction]);
        el.style.left = `${target}%`;
        this.positions.set(guest.uid, target);
      }
      this.scheduleGuests();
    }, 3200);
  }
  isBathing() {
    return this.bathOn;
  }
  toggleBath() {
    this.bathOn = !this.bathOn;
    this.showering = false;
    this.clearCare();
    this.root.classList.toggle('bath-mode', this.bathOn);
    if (this.bathOn) {
      this.clearBehavior();
      this.freeze();
      this.show(this.behavior(this.pony.idle));
      this.say('Hold and move the water over your pony to wash.');
    } else this.ambient();
    return this.bathOn;
  }
  private waterAt(ev: PointerEvent) {
    const rect = this.root.getBoundingClientRect();
    this.water.style.left = ev.clientX - rect.left + 'px';
    this.water.style.top = ev.clientY - rect.top + 'px';
    if (this.showering) this.tryWash(ev.clientX, ev.clientY);
  }
  private tryWash(x: number, y: number) {
    const img = this.root.querySelector<HTMLImageElement>('#pet-sprite')!;
    const rect = img.getBoundingClientRect();
    if (
      x < rect.left ||
      x > rect.right ||
      y < rect.top ||
      y > rect.bottom ||
      Date.now() - this.lastWash < 800 ||
      !img.complete
    )
      return;
    const probe = document.createElement('canvas');
    probe.width = 64;
    probe.height = 64;
    const ctx = probe.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, 64, 64);
    if (
      ctx.getImageData(
        Math.min(63, Math.floor(((x - rect.left) / rect.width) * 64)),
        Math.min(63, Math.floor(((y - rect.top) / rect.height) * 64)),
        1,
        1,
      ).data[3] < 32
    )
      return;
    this.lastWash = Date.now();
    this.onWash();
    this.root.classList.add('washing');
    clearTimeout(this.washGlowTimer);
    this.washGlowTimer = setTimeout(() => this.root.classList.remove('washing'), 1000);
  }
  private drawDirt() {
    if (this.destroyed) return;
    const img = this.root.querySelector<HTMLImageElement>('#pet-sprite');
    const dirt = this.getDirt();
    this.root.dataset.dirt = String(dirt);
    if (img && img.complete && img.naturalWidth) {
      const rect = img.getBoundingClientRect(),
        scene = this.root.getBoundingClientRect();
      const canvas = this.dirtCanvas;
      const w = 64,
        h = Math.max(20, Math.round((64 * rect.height) / Math.max(1, rect.width)));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      Object.assign(canvas.style, {
        left: rect.left - scene.left + 'px',
        top: rect.top - scene.top + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
      });
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#805c37b8';
      for (let n = 0; n < Math.round(dirt * 28); n++) {
        const x = (n * 23 + 17) % w,
          y = (n * 37 + 13) % h;
        ctx.fillRect(x, y, 3 + (n % 4), 3 + (n % 3));
        ctx.fillRect(x + 2, y - 2, 3, 3);
      }
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(img, 0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      if (this.showering) {
        const water = this.water.getBoundingClientRect();
        this.tryWash(water.left + water.width / 2, water.top + water.height / 2);
      }
    }
    this.drawing = setTimeout(() => this.drawDirt(), 100);
  }
  friendX(uid: string) {
    return this.positions.get(uid);
  }
  destroy() {
    this.destroyed = true;
    this.resizeObserver.disconnect();
    this.controller.abort();
    clearTimeout(this.drawing);
    clearTimeout(this.washGlowTimer);
    this.clearBehavior();
    this.clearCare();
    clearTimeout(this.bubbleTimer);
    clearTimeout(this.guestTimer);
    this.cameos.replaceChildren();
  }
}
