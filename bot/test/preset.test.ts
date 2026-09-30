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
  assert.deepEqual(yard(ctxOf('B', obs))[0]?.order, { kind: 'yard', cls: 'клинок' });
  assert.deepEqual(yard(ctxOf('B', obs, 2026, presetOf('широкий+klinokTarget=0')))[0]?.order, { kind: 'yard', cls: 'ткач' });
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

test('preset names accept knob overrides', () => {
  const p = presetOf('скупий+steal=0+unlock=0.25+feed=1');
  assert.equal(p.tkachTarget, 2);
  assert.equal(p.steal, 0);
  assert.equal(p.unlock, 0.25);
  assert.equal(p.feed, true);
  assert.equal(p.name, 'скупий+steal=0+unlock=0.25+feed=1');
  assert.throws(() => presetOf('скупий+nosuch=1'));
  assert.throws(() => presetOf('скупий+steal=x'));
});

test('preset values are pinned', () => {
  assert.deepEqual(PRESETS['основний'], { name: 'основний', tkachTarget: 3, buildReserve: 0, etaPower: 1, feed: false, harm: 0.5, unlock: 0.5, steal: 1, repair: 1, klinokTarget: 2, contract: 1, dawnPrep: 1, ramGrace: 0, ramStill: 0, ramTiming: 0, chaseOff: 0, ramJammers: 0, guardFirst: 1, jam: 0, jamHome: 1, jamLeader: 1, pact: 0, pactGap: 0.15 });
  assert.deepEqual([PRESETS['широкий']?.tkachTarget, PRESETS['широкий']?.etaPower], [4, 0.8]);
  assert.equal(PRESETS['ближній']?.etaPower, 1.5);
  assert.deepEqual([PRESETS['скупий']?.tkachTarget, PRESETS['скупий']?.buildReserve], [2, 60]);
  assert.deepEqual([PRESETS['варта']?.tkachTarget, PRESETS['варта']?.klinokTarget], [2, 4]);
});

test('every malformed knob is refused with its text', () => {
  for (const bad of ['steal', 'steal=', '=1', 'nosuch=1', 'steal=x']) assert.throws(() => presetOf('основний+' + bad), new RegExp('^Error: bad preset knob ' + bad.replace('=', '\=') + '$'));
  assert.equal(presetOf('основний+feed=0').feed, false);
});
