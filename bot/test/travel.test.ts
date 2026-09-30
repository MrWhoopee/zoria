import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '@zoria/engine';
import { RulesOracle } from '@zoria/sdk';
import { keyOf, neighbors } from '../src/hex.ts';
import { stepTicks, travelField } from '../src/map/travel.ts';
import { manifestBytes, valleyOf } from './fixture.ts';

test('stepTicks matches the rules oracle on every legal step', () => {
  const v = valleyOf('A');
  const o = new RulesOracle(createEngine, manifestBytes());
  let checked = 0;
  for (const c of v.cells) {
    for (const n of neighbors(c)) {
      const legal = o.canStep(c, n);
      const mine = stepTicks(v, c, n, 'ткач');
      assert.equal(mine !== null, legal, 'legality ' + keyOf(c) + '->' + keyOf(n));
      if (legal) {
        assert.equal(mine, o.stepCost(c, n, 'ткач'), 'tkach ' + keyOf(c) + '->' + keyOf(n));
        assert.equal(stepTicks(v, c, n, 'клинок'), o.stepCost(c, n, 'клинок'), 'klinok ' + keyOf(c) + '->' + keyOf(n));
        checked++;
      }
    }
  }
  assert.ok(checked > 5000);
});

test('travelField gives zero at the origin and step cost at neighbours', () => {
  const v = valleyOf('B');
  const f = travelField(v, v.base, 'ткач');
  assert.equal(f.get(keyOf(v.base)), 0);
  for (const n of neighbors(v.base)) {
    const s = stepTicks(v, v.base, n, 'ткач');
    if (s !== null) assert.ok((f.get(keyOf(n)) ?? Infinity) <= s);
  }
  assert.ok(f.size > 900);
});

test('travelField is a shortest-path field', () => {
  const v = valleyOf('C');
  const f = travelField(v, v.base, 'клинок');
  for (const c of v.cells) {
    const d = f.get(keyOf(c));
    if (d === undefined) continue;
    for (const n of neighbors(c)) {
      const s = stepTicks(v, c, n, 'клинок');
      const dn = f.get(keyOf(n));
      if (s !== null && dn !== undefined) assert.ok(dn <= d + s);
    }
  }
});

test('a climb of one level costs extra, two levels is a cliff, a drop is free', () => {
  const v = valleyOf('A');
  const a = { q: 0, r: -10 };
  const b = { q: 1, r: -10 };
  v.terrain.set('0,-10', 0);
  v.terrain.set('1,-10', 0);
  v.level.set('0,-10', 1);
  v.level.set('1,-10', 2);
  assert.equal(stepTicks(v, a, b, 'ткач'), 3);
  assert.equal(stepTicks(v, b, a, 'ткач'), 2);
  assert.equal(stepTicks(v, a, b, 'клинок'), 2);
  v.level.set('1,-10', 3);
  assert.equal(stepTicks(v, a, b, 'ткач'), null);
  assert.equal(stepTicks(v, b, a, 'ткач'), 2);
  v.level.set('1,-10', 4);
  assert.equal(stepTicks(v, a, b, 'клинок'), null);
});

test('water, mountains and cells outside the valley cannot be entered', () => {
  const v = valleyOf('A');
  const a = { q: 0, r: -10 };
  v.terrain.set('1,-10', 6);
  assert.equal(stepTicks(v, a, { q: 1, r: -10 }, 'ткач'), null);
  v.terrain.set('1,-10', 7);
  assert.equal(stepTicks(v, a, { q: 1, r: -10 }, 'ткач'), null);
  assert.equal(stepTicks(v, { q: 0, r: 19 }, { q: 0, r: 20 }, 'ткач'), null);
});

test('travelField finds the exact cheapest cost around a wall', () => {
  const v = valleyOf('A');
  for (const c of v.cells) {
    v.terrain.set(c.q + ',' + c.r, 0);
    v.level.set(c.q + ',' + c.r, 0);
  }
  for (let r = -3; r <= 3; r++) v.terrain.set('1,' + r, 7);
  const f = travelField(v, { q: 0, r: 0 }, 'клинок');
  assert.equal(f.get('2,0'), 9);
  assert.equal(f.get('0,5'), 5);
  assert.equal(f.get('1,0'), undefined);
  const t = travelField(v, { q: 0, r: 0 }, 'ткач');
  assert.equal(t.get('2,0'), 18);
});
