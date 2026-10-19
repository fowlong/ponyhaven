import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { projectStage } from '../src/backgrounds.ts';
import type { Background } from '../src/types.ts';
const backgrounds: Background[] = JSON.parse(fs.readFileSync('public/data/backgrounds.json', 'utf8'));
const reviews = JSON.parse(fs.readFileSync('scripts/background-curation.json', 'utf8')).backgrounds;

test('only visually reviewed scenery enters the rotation, with complete source geometry', () => {
  assert.equal(Object.keys(reviews).length, 125);
  assert.equal(backgrounds.length, Object.values(reviews).filter((r: any) => r.include).length);
  for (const b of backgrounds) {
    assert.ok(reviews[b.id]?.include, b.id);
    assert.ok(fs.existsSync('public/' + b.file), b.file);
    assert.deepEqual(b.stage, reviews[b.id].stage);
    assert.ok(b.stage!.walk[0] < b.stage!.walk[1]);
  }
  for (const id of ['airship_harbor-2bf3be', 'hot_air_balloon_flying', 'dream'])
    assert.ok(!backgrounds.some((b) => b.id === id || b.id.startsWith(id + '-')));
});

test('each source floor and pony scale survive desktop, tablet and phone cover crops', () => {
  for (const b of backgrounds)
    for (const [width, height] of [
      [1040, 414],
      [800, 390],
      [624, 390],
      [354, 340],
      [288, 340],
    ]) {
      const stage = b.stage!,
        g = projectStage(stage, width, height);
      const imageHeight = stage.height * Math.max(width / stage.width, height / stage.height);
      assert.ok(Math.abs((g.floor - height + imageHeight) / imageHeight - stage.floor) < 1e-8);
      assert.ok(Math.abs((g.scale * 84) / imageHeight - stage.ponyHeight) < 1e-8);
      assert.ok(g.floor > height * 0.5 && g.floor < height * 0.94, b.name);
      assert.ok(g.min >= 0 && g.max <= 100 && g.max - g.min >= 12, `${b.name}: ${width}`);
      assert.ok((g.min * width) / 100 - g.scale * 46 >= 0, b.name);
      assert.ok((g.max * width) / 100 + g.scale * 46 <= width, b.name);
    }
});
