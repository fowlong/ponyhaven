import type { Behavior, Pony } from './types';

/** Viewport fitting belongs to the pony, not each animation's transparent canvas. */
export function ponyScale(pony: Pony, scale: number, width: number, floor: number) {
  const [w, h] = pony.spriteSize || [92, 84];
  return Math.max(0.01, Math.min(scale, Math.min(width * 0.7, 420) / w, Math.max(1, Math.min(floor - 48, 280)) / h));
}

export function animationFits(pony: Pony, behavior: Behavior, scale: number, width: number, floor: number) {
  if(behavior.scaleSafe===false)return false;
  const sizes = [behavior.sizeRight, behavior.sizeLeft].filter((s): s is [number, number] => !!s);
  const fitted = ponyScale(pony, scale, width, floor);
  return sizes.every(([w, h]) => w * fitted <= width - 16 && h * fitted <= floor - 16);
}
