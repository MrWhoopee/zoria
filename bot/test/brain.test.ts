import test from 'node:test';
import assert from 'node:assert/strict';
import type { Order, Verdict } from '@zoria/protocol';
import { Brain } from '../src/brain.ts';
import { scheduleOf } from '../src/preset.ts';
import type { Ctx } from '../src/plans/types.ts';
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
  const b = brainWith([(ctx) => ctx.w.units.map((u) => ({ tag: 'x', unit: u.id, order: { kind: 'feed', unit: u.id, q: 7, r: 5 }, value: 1, bytes: 32, energy: 0, commit: () => undefined, refused: () => undefined }))]);
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

test('the time guard allows exactly the limit', () => {
  let now = 0;
  let second = 0;
  const b = brainWith([() => { now += 300; return []; }, () => { second++; return []; }], () => now);
  b.tick(makeObs({ t: 1 }));
  assert.equal(second, 1);
  assert.equal(b.stats.skipped, 0);
});

test('a low-value task waits while busy units need the channel for hands', () => {
  const busy = { goal: null, site: null, feed: null, jam: null, ram: null, home: false, path: 2 };
  const low: Advisor = () => [{ tag: 'low', unit: 'T-B9', order: { kind: 'halt', unit: 'T-B9' }, value: 0.01, bytes: 32, energy: 0, commit: () => undefined, refused: () => undefined }];
  const four = ['T-B1', 'T-B2', 'T-B3', 'T-B4'].map((id) => tkach(id, 6, 6, { task: busy }));
  const b = brainWith([low]);
  assert.deepEqual(b.tick(makeObs({ t: 2, mine: { ...makeObs().mine, needles: starts, units: [...four, tkach('T-B9', 6, 6)] } })), []);
  const b2 = brainWith([low]);
  assert.equal(b2.tick(makeObs({ t: 2, mine: { ...makeObs().mine, needles: starts, units: [...four.slice(0, 2), tkach('T-B9', 6, 6)] } })).length, 1);
});

test('the think limit is 300 ms of the 500 ms deadline', async () => {
  const { THINK_LIMIT_MS } = await import('../src/brain.ts');
  assert.equal(THINK_LIMIT_MS, 300);
});

test('the brain keeps a decision record for the last tick', () => {
  const b = brainWith();
  b.tick(makeObs({ t: 1, mine: { ...makeObs().mine, needles: starts } }));
  const d = b.decisions();
  assert.equal(d.t, 1);
  assert.equal(d.preset, 'основний');
  assert.deepEqual(d.chosen.map((c) => [c.tag, c.unit, c.order.kind]), [['yard', null, 'yard']]);
  assert.equal(d.chosen[0]?.value, 1e6);
  assert.equal(d.offered, 1);
  assert.deepEqual(d.errors, 0);
});

function scheduled(name: string, seen: string[]): Brain {
  const ctx = ctxOf('B', makeObs());
  const spy: Advisor = (c: Ctx) => {
    seen.push(c.preset.name);
    return [];
  };
  return new Brain(ctx.v, ctx.links, [spy], undefined, scheduleOf(name));
}

test('the brain switches its preset at the scheduled tick and logs it', () => {
  const seen: string[] = [];
  const b = scheduled('основний>широкий@2', seen);
  for (let t = 1; t <= 3; t++) b.tick(makeObs({ t, mine: { ...makeObs().mine, needles: starts } }));
  assert.deepEqual(seen, ['основний', 'широкий', 'широкий']);
  assert.equal(b.decisions().preset, 'широкий');
});

test('a boundary skipped by missed frames still switches the preset', () => {
  const seen: string[] = [];
  const b = scheduled('основний>варта@3', seen);
  b.tick(makeObs({ t: 1, mine: { ...makeObs().mine, needles: starts } }));
  b.tick(makeObs({ t: 5, mine: { ...makeObs().mine, needles: starts } }));
  assert.deepEqual(seen, ['основний', 'варта']);
  assert.equal(b.decisions().preset, 'варта');
});
