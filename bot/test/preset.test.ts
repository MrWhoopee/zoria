import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, presetOf } from '../src/preset.ts';
import { expand } from '../src/plans/expand.ts';
import { yard } from '../src/plans/yard.ts';
import { createStrategy, presets } from '../src/strategy.ts';
import { ctxOf } from './ctx.ts';
import { makeObs, tkach } from './obs.ts';

const starts = [{ q: 7, r: 5, dark: false, fed: false, weight: 1 }, { q: 5, r: 7, dark: false, fed: false, weight: 1 }];

test('presetOf falls back to the main preset', () => {
  assert.equal(presetOf('немає такого').name, 'основний');
  assert.equal(presetOf('широкий').tkachTarget, 4);
});

test('yard follows the preset Tkach target', () => {
  const units = [tkach('T-B1', 6, 6), tkach('T-B2', 6, 7), tkach('T-B3', 7, 6)];
  const obs = makeObs({ pulse: { ...makeObs().pulse, energy: 300 }, mine: { ...makeObs().mine, units } });
  assert.equal(yard(ctxOf('B', obs)).length, 0);
  assert.equal(yard(ctxOf('B', obs, 2026, presetOf('широкий'))).length, 1);
});

test('a preset without feeding never feeds', () => {
  const v = ctxOf('B', makeObs()).v;
  const own = v.ruins.map((c) => ({ q: c.q, r: c.r, owner: 'K' as const, dark: true }));
  const obs = makeObs({ t: 200, pulse: { ...makeObs().pulse, energy: 10 }, own, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 6, 6)] } });
  assert.equal(expand(ctxOf('B', obs, 2026, { ...presetOf('основний'), feed: true }))[0]?.order.kind, 'feed');
  assert.equal(expand(ctxOf('B', obs)).length, 0);
});

test('strategy lists every preset', () => {
  assert.deepEqual(presets(), Object.keys(PRESETS));
  assert.ok(presets().includes('основний'));
  assert.ok(createStrategy('скупий'));
});
