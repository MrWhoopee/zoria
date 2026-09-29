import test from 'node:test';
import assert from 'node:assert/strict';
import type { Order, Verdict } from '@zoria/protocol';
import { Brain } from '../src/brain.ts';
import type { Advisor } from '../src/plans/types.ts';
import { ctxOf } from './ctx.ts';
import { makeObs, tkach } from './obs.ts';

const starts = [{ q: 7, r: 5, dark: false, fed: false, weight: 1 }, { q: 5, r: 7, dark: false, fed: false, weight: 1 }];

function brainWith(advisors?: Advisor[], clock?: () => number): Brain {
  const ctx = ctxOf('B', makeObs());
  return new Brain(ctx.v, ctx.links, advisors, clock);
}

function accept(orders: Order[]): Verdict[] {
  return orders.map((_, i) => [i, true, 0]);
}

test('keep-alive fires at least every four ticks even when advisors fail', () => {
  const b = brainWith([() => { throw new Error('boom'); }]);
  let last = 0;
  for (let t = 1; t <= 40; t++) {
    const orders = b.tick(makeObs({ t, pulse: { ...makeObs().pulse, energy: 0 }, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 6, 6)] } }));
    if (orders.length > 0) {
      assert.ok(t - last <= 4, 'gap at ' + t);
      last = t;
    }
    b.feedback(accept(orders));
  }
  assert.equal(b.stats.errors, 40);
  assert.equal(b.stats.lastError, 'boom');
});

test('refused commands do not count as alive', () => {
  const b = brainWith([]);
  let sent = 0;
  for (let t = 1; t <= 12; t++) {
    const orders = b.tick(makeObs({ t, mine: { ...makeObs().mine, needles: starts } }));
    if (orders.length > 0) sent++;
    b.feedback(orders.map((_, i) => [i, false, 6]));
  }
  assert.ok(sent >= 8);
});

test('keep-alive uses a free halt on an idle unit, else a watch on the base', () => {
  const b = brainWith([]);
  const withUnit = b.tick(makeObs({ t: 5, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 6, 6)] } }));
  assert.deepEqual(withUnit, [{ kind: 'halt', unit: 'T-B6' }]);
  const b2 = brainWith([]);
  const bare = b2.tick(makeObs({ t: 5, mine: { ...makeObs().mine, needles: starts } }));
  assert.deepEqual(bare, [{ kind: 'watch', q: 6, r: 6, keep: 0 }]);
});

test('the time guard skips advisors after the limit', () => {
  let now = 0;
  let second = 0;
  const b = brainWith([() => { now += 400; return []; }, () => { second++; return []; }], () => now);
  b.tick(makeObs({ t: 1 }));
  assert.equal(second, 0);
  assert.equal(b.stats.skipped, 1);
});

test('the default brain orders a Tkach on the first tick', () => {
  const b = brainWith();
  const orders = b.tick(makeObs({ t: 1, mine: { ...makeObs().mine, needles: starts } }));
  assert.deepEqual(orders, [{ kind: 'yard', cls: 'ткач' }]);
});

test('keep-alive falls back to a watch when the idle unit already got a refused order', () => {
  const b = brainWith([(ctx) => ctx.w.units.map((u) => ({ tag: 'x', unit: u.id, order: { kind: 'feed', unit: u.id, q: 7, r: 5 }, value: 1, bytes: 32, hands: 32, energy: 0, commit: () => undefined, refused: () => undefined }))]);
  let silent = 0;
  let worst = 0;
  for (let t = 1; t <= 20; t++) {
    const orders = b.tick(makeObs({ t, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 6, 6)] } }));
    const ok = orders.some((o) => o.kind === 'watch');
    silent = ok ? 0 : silent + 1;
    worst = Math.max(worst, silent);
    b.feedback(orders.map((o, i) => [i, o.kind === 'watch', o.kind === 'watch' ? 0 : 13]));
  }
  assert.ok(worst < 6, 'silent run ' + worst);
});
