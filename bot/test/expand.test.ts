import test from 'node:test';
import assert from 'node:assert/strict';
import type { Order } from '@zoria/protocol';
import { dist, keyOf } from '../src/hex.ts';
import { expand, release } from '../src/plans/expand.ts';
import { ctxOf } from './ctx.ts';
import { makeObs, tkach } from './obs.ts';

const starts = [{ q: 7, r: 5, dark: false, fed: false, weight: 1 }, { q: 5, r: 7, dark: false, fed: false, weight: 1 }];

function target(o: Order | undefined): string {
  if (!o || (o.kind !== 'move' && o.kind !== 'needle')) throw new Error('not a site order');
  return o.q + ',' + o.r;
}

test('an idle Tkach goes to a linked ruin with a heating goal', () => {
  const ctx = ctxOf('B', makeObs({ t: 30, pulse: { ...makeObs().pulse, energy: 40 }, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 6, 6)] } }));
  const tasks = expand(ctx);
  assert.equal(tasks.length, 1);
  const o = tasks[0]?.order;
  assert.equal(o?.kind, 'move');
  const k = target(o);
  assert.ok(ctx.v.ruins.some((c) => keyOf(c) === k));
  assert.ok(ctx.links.reach({ q: Number(k.split(',')[0]), r: Number(k.split(',')[1]) }, [ctx.v.base, ...ctx.w.ownLit()]));
  if (o?.kind === 'move') assert.deepEqual(o.goal, { q: o.q, r: o.r });
  assert.equal(tasks[0]?.hands, 32);
});

test('two Tkachs never share a target and commit reserves it', () => {
  const ctx = ctxOf('B', makeObs({ t: 40, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 6, 6), tkach('T-B9', 6, 7)] } }));
  const tasks = expand(ctx);
  assert.equal(tasks.length, 2);
  assert.notEqual(target(tasks[0]?.order), target(tasks[1]?.order));
  tasks[0]?.commit(ctx.memo, 40);
  const again = expand(ctx);
  assert.ok(again.every((t) => t.unit !== tasks[0]?.unit));
  assert.ok(again.every((t) => target(t.order) !== target(tasks[0]?.order)));
});

test('a Tkach mid-step gets no order', () => {
  const ctx = ctxOf('B', makeObs({ t: 30, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 6, 6, { wait: 1 })] } }));
  assert.equal(expand(ctx).length, 0);
});

test('builds when no ruin is available and energy allows', () => {
  const v = ctxOf('B', makeObs()).v;
  const own = v.ruins.map((c) => ({ q: c.q, r: c.r, owner: 'A' as const, dark: true }));
  const units = [tkach('T-B6', 6, 6), tkach('T-B7', 6, 7), tkach('T-B8', 7, 6)];
  const ctx = ctxOf('B', makeObs({ t: 200, pulse: { ...makeObs().pulse, energy: 200 }, own, mine: { ...makeObs().mine, needles: starts, units } }));
  const tasks = expand(ctx);
  assert.ok(tasks.length >= 1);
  const o = tasks[0]?.order;
  assert.equal(o?.kind, 'needle');
  const k = target(o);
  assert.ok(!ctx.w.owner.has(k));
  const site = { q: Number(k.split(',')[0]), r: Number(k.split(',')[1]) };
  for (const s of Object.values(ctx.v.seats)) assert.ok(dist(s, site) > 2);
});

test('with nothing to take, a Tkach feeds an own lit needle', () => {
  const v = ctxOf('B', makeObs()).v;
  const own = v.ruins.map((c) => ({ q: c.q, r: c.r, owner: 'A' as const, dark: true }));
  const ctx = ctxOf('B', makeObs({ t: 200, pulse: { ...makeObs().pulse, energy: 10 }, own, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 6, 6)] } }));
  const tasks = expand(ctx);
  assert.equal(tasks[0]?.order.kind, 'feed');
});

test('release drops reservations of dead units and of targets taken by others', () => {
  const ctx = ctxOf('B', makeObs({ t: 60, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 6, 6)] } }));
  const [r0, r1] = ctx.v.ruins;
  assert.ok(r0 && r1);
  ctx.memo.res.set('T-B6', { kind: 'take', cell: r0, since: 50, sent: 50 });
  ctx.memo.res.set('T-B99', { kind: 'take', cell: r1, since: 50, sent: 50 });
  ctx.w.owner.set(keyOf(r0), 'A');
  release(ctx);
  assert.equal(ctx.memo.res.size, 0);
});

test('release drops a reservation once the needle is ours', () => {
  const ctx = ctxOf('B', makeObs({ t: 60, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 6, 6)] } }));
  ctx.memo.res.set('T-B6', { kind: 'take', cell: { q: 7, r: 5 }, since: 50, sent: 50 });
  release(ctx);
  assert.equal(ctx.memo.res.size, 0);
});

test('a refused site is banned and its reservation dropped', () => {
  const ctx = ctxOf('B', makeObs({ t: 30, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 6, 6)] } }));
  const t0 = expand(ctx)[0];
  assert.ok(t0);
  t0.commit(ctx.memo, 30);
  t0.refused(ctx.memo, 11);
  assert.equal(ctx.memo.res.has('T-B6'), false);
  assert.equal(ctx.memo.banned.has(target(t0.order)), true);
});

test('an idle reserved Tkach away from its target is re-sent, but not every tick', () => {
  const ctx = ctxOf('B', makeObs({ t: 60, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 6, 6)] } }));
  const r0 = ctx.v.ruins.find((c) => ctx.links.reach(c, [ctx.v.base]));
  assert.ok(r0);
  ctx.memo.res.set('T-B6', { kind: 'take', cell: r0, since: 50, sent: 50 });
  const tasks = expand(ctx);
  assert.equal(tasks.length, 1);
  assert.equal(target(tasks[0]?.order), keyOf(r0));
  ctx.memo.res.set('T-B6', { kind: 'take', cell: r0, since: 50, sent: 58 });
  assert.equal(expand(ctx).length, 0);
});
