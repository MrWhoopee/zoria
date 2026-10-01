import test from 'node:test';
import assert from 'node:assert/strict';
import type { Observe } from '@zoria/protocol';
import { auction } from '../src/plans/auction.ts';
import { presetOf } from '../src/preset.ts';
import type { Ctx } from '../src/plans/types.ts';
import { ctxOf } from './ctx.ts';
import { makeObs, tkach } from './obs.ts';

const starts = [{ q: 7, r: 5, dark: false, fed: false, weight: 1 }, { q: 5, r: 7, dark: false, fed: false, weight: 1 }];
const near = [{ q: 9, r: 2 }, { q: 10, r: 0 }];
const far = [{ q: -14, r: 12 }, { q: -12, r: 10 }];

function obsAt(t: number, energy: number, over: Partial<Observe> = {}): Observe {
  const base = makeObs();
  return makeObs({ t, pulse: { ...base.pulse, energy }, mine: { ...base.mine, needles: starts }, ...over });
}

function ctxWith(obs: Observe, knobs: string, cells = near, at = 350): Ctx {
  const ctx = ctxOf('B', obs, 2026, presetOf('основний' + knobs));
  ctx.v.lots = [{ at: 150, cells: far }, { at, cells }];
  return ctx;
}

test('the test lot links to the base through its first needle and the far lot does not link', () => {
  const ctx = ctxWith(obsAt(349, 300), '+auction=1');
  assert.ok(ctx.links.reach(near[0] ?? ctx.v.base, [ctx.v.base]));
  assert.ok(!ctx.links.reach(near[1] ?? ctx.v.base, [ctx.v.base]));
  assert.ok(ctx.links.reach(near[1] ?? ctx.v.base, [ctx.v.base, near[0] ?? ctx.v.base]));
  assert.ok(far.every((c) => !ctx.links.reach(c, [ctx.v.base])));
});

test('bidding is off unless the preset turns it on', () => {
  assert.deepEqual(auction(ctxWith(obsAt(349, 300), '')), []);
});

test('one tick before the reveal it bids 60 per usable lot needle times the knob', () => {
  const tasks = auction(ctxWith(obsAt(349, 300), '+auction=1'));
  assert.deepEqual(tasks.map((t) => [t.tag, t.order, t.energy]), [['auction', { kind: 'bid', lot: 1, amount: 120 }, 120]]);
  assert.deepEqual(auction(ctxWith(obsAt(349, 400), '+auction=2.5'))[0]?.order, { kind: 'bid', lot: 1, amount: 300 });
});

test('it bids only in the last three ticks before the reveal', () => {
  assert.equal(auction(ctxWith(obsAt(347, 300), '+auction=1')).length, 1);
  assert.deepEqual(auction(ctxWith(obsAt(346, 300), '+auction=1')), []);
  assert.deepEqual(auction(ctxWith(obsAt(350, 300), '+auction=1')), []);
});

test('the bid never exceeds the charge left after Tkachs that are building', () => {
  assert.deepEqual(auction(ctxWith(obsAt(349, 100), '+auction=3'))[0]?.order, { kind: 'bid', lot: 1, amount: 100 });
  const builders = [tkach('T-B1', 6, 6, { work: 4 })];
  const obs = obsAt(349, 200, { mine: { ...makeObs().mine, needles: starts, units: builders } });
  assert.deepEqual(auction(ctxWith(obs, '+auction=3'))[0]?.order, { kind: 'bid', lot: 1, amount: 140 });
});

test('no bid below the 60 reserve', () => {
  assert.deepEqual(auction(ctxWith(obsAt(349, 59), '+auction=1')), []);
});

test('needles already owned or out of reach do not count', () => {
  const own = [{ q: 9, r: 2, owner: 'A' as const, dark: false }];
  assert.deepEqual(auction(ctxWith(obsAt(349, 300, { own }), '+auction=1'))[0]?.order, { kind: 'bid', lot: 1, amount: 60 });
  assert.deepEqual(auction(ctxWith(obsAt(349, 300), '+auction=1', far)), []);
});

test('the same bid is not sent twice, a changed one is, a refused one is retried', () => {
  const ctx = ctxWith(obsAt(348, 300), '+auction=1');
  const first = auction(ctx)[0];
  assert.ok(first);
  first.commit(ctx.memo, 348);
  assert.deepEqual(auction(ctx), []);
  ctx.w.update(obsAt(349, 90));
  const lower = auction(ctx)[0];
  assert.deepEqual(lower?.order, { kind: 'bid', lot: 1, amount: 90 });
  lower?.refused(ctx.memo, 0);
  assert.deepEqual(auction(ctx)[0]?.order, { kind: 'bid', lot: 1, amount: 90 });
});
