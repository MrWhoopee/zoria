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
