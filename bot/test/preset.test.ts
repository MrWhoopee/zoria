import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, SCHEDULES, presetAt, presetOf, scheduleOf } from '../src/preset.ts';
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

test('strategy lists every preset and named schedule, never a raw schedule', () => {
  assert.deepEqual(presets(), [...Object.keys(PRESETS), ...Object.keys(SCHEDULES)]);
  assert.ok(presets().includes('основний'));
  assert.ok(presets().includes('загарбник'));
  assert.ok(!presets().includes('широкий>глушій@400'));
  assert.ok(createStrategy('скупий'));
  assert.ok(createStrategy('загарбник'));
});

test('adaptive red schedules are pinned and parse', () => {
  assert.deepEqual(SCHEDULES, {
    загарбник: 'широкий+tkachTarget=5>глушій+klinokTarget=6@400',
    'пізній-глушій': 'скупий>глушій@600',
    'ранній-глушій': 'глушій+jamLeader=6>широкий@500',
    рейдер: 'варта>глушій+jamLeader=6@800',
    маятник: 'основний>глушій@300>широкий@700',
  });
  for (const name of Object.keys(SCHEDULES)) assert.ok(scheduleOf(name).length >= 2, name);
  assert.deepEqual(scheduleOf('маятник').map((s) => [s.at, s.preset.name]), [[0, 'основний'], [300, 'глушій'], [700, 'широкий']]);
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
  assert.deepEqual(PRESETS['глушій'], { ...PRESETS['варта'], name: 'глушій', jam: 1, jamHome: 0, jamLeader: 3 });
});

test('every malformed knob is refused with its text', () => {
  for (const bad of ['steal', 'steal=', '=1', 'nosuch=1', 'steal=x']) assert.throws(() => presetOf('основний+' + bad), new RegExp('^Error: bad preset knob ' + bad.replace('=', '\=') + '$'));
  assert.equal(presetOf('основний+feed=0').feed, false);
});

test('a plain name is a one-step schedule', () => {
  const s = scheduleOf('скупий+steal=0');
  assert.equal(s.length, 1);
  assert.equal(s[0]?.at, 0);
  assert.equal(s[0]?.preset.name, 'скупий+steal=0');
  assert.equal(scheduleOf('немає такого')[0]?.preset.name, 'основний');
});

test('schedule segments carry their own knobs and start ticks', () => {
  const s = scheduleOf('широкий+tkachTarget=5>глушій+klinokTarget=6@400>основний@900');
  assert.deepEqual(s.map((x) => [x.at, x.preset.name]), [[0, 'широкий+tkachTarget=5'], [400, 'глушій+klinokTarget=6'], [900, 'основний']]);
  assert.equal(s[0]?.preset.tkachTarget, 5);
  assert.equal(s[1]?.preset.klinokTarget, 6);
  assert.equal(s[1]?.preset.jam, 1);
});

test('presetAt switches exactly at the start tick', () => {
  const s = scheduleOf('основний>широкий@300>варта@700');
  assert.deepEqual([0, 299, 300, 301, 699, 700, 5000].map((t) => presetAt(s, t).name), ['основний', 'основний', 'широкий', 'широкий', 'широкий', 'варта', 'варта']);
});

test('malformed schedules are refused with their text', () => {
  for (const bad of ['основний@0', 'основний@5>широкий@9', 'основний>широкий', 'основний>широкий@', 'основний>широкий@0', 'основний>широкий@-1', 'основний>широкий@4.5', 'основний>широкий@x', 'основний>широкий@300>варта@300', 'основний>широкий@300>варта@200', 'основний> широкий@300', 'основний>глушйі@300', 'основний>рівний@300', 'основний>', '>широкий@3']) {
    assert.throws(() => scheduleOf(bad), (e: unknown) => e instanceof Error && e.message === 'bad preset schedule ' + bad, bad);
  }
  assert.throws(() => scheduleOf('основний>широкий+nosuch=1@300'), /^Error: bad preset knob nosuch=1$/);
});

test('presetOf of a schedule name gives its first step', () => {
  assert.equal(presetOf('широкий>варта@300').name, 'широкий');
});
