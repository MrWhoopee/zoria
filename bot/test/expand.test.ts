import test from 'node:test';
import assert from 'node:assert/strict';
import type { Order } from '@zoria/protocol';
import { dist, keyOf } from '../src/hex.ts';
import { expand, reconnectValue, release, sites, unlockValue } from '../src/plans/expand.ts';
import { presetOf } from '../src/preset.ts';
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
  const ctx = ctxOf('B', makeObs({ t: 30, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 6, 6, { wait: 1, task: { goal: null, site: null, feed: null, jam: null, ram: null, home: false, path: 3 } })] } }));
  assert.equal(expand(ctx).length, 0);
});

test('builds when no ruin is available and energy allows', () => {
  const v = ctxOf('B', makeObs()).v;
  const own = v.ruins.map((c) => ({ q: c.q, r: c.r, owner: 'K' as const, dark: true }));
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
  const own = v.ruins.map((c) => ({ q: c.q, r: c.r, owner: 'K' as const, dark: true }));
  const ctx = ctxOf('B', makeObs({ t: 200, pulse: { ...makeObs().pulse, energy: 10 }, own, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 6, 6)] } }), 2026, { ...presetOf('основний'), feed: true });
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

test('a linked foe needle is a target when no ruin is free', () => {
  const v = ctxOf('B', makeObs()).v;
  const own = v.ruins.map((c) => ({ q: c.q, r: c.r, owner: 'A' as const, dark: false }));
  const ctx = ctxOf('B', makeObs({ t: 200, pulse: { ...makeObs().pulse, energy: 10 }, own, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 6, 6)] } }));
  const tasks = expand(ctx);
  assert.equal(tasks[0]?.order.kind, 'move');
  const k = target(tasks[0]?.order);
  assert.equal(ctx.w.owner.get(k), 'A');
  assert.ok(!ctx.v.starts.some((s) => keyOf(s.cell) === k));
});

test('a take reservation on a foe needle survives until the owner changes', () => {
  const ctx = ctxOf('B', makeObs({ t: 60, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 6, 6)] } }));
  const r0 = ctx.v.ruins[0];
  assert.ok(r0);
  ctx.w.owner.set(keyOf(r0), 'A');
  ctx.memo.res.set('T-B6', { kind: 'take', cell: r0, since: 50, sent: 50, owner: 'A' });
  release(ctx);
  assert.equal(ctx.memo.res.size, 1);
  ctx.w.owner.set(keyOf(r0), 'C');
  release(ctx);
  assert.equal(ctx.memo.res.size, 0);
});

test('a bridge site is worth the ruins it brings into reach', () => {
  const ctx = ctxOf('B', makeObs({ t: 100, mine: { ...makeObs().mine, needles: starts } }));
  const anchors = [ctx.v.base, ...ctx.w.ownLit()];
  const far = ctx.v.ruins.find((r) => !ctx.links.reach(r, anchors) && ctx.v.cells.some((c) => ctx.links.reach(c, anchors) && ctx.links.ok(c, r)));
  assert.ok(far);
  const site = ctx.v.cells.find((c) => ctx.links.reach(c, anchors) && ctx.links.ok(c, far));
  assert.ok(site);
  assert.ok(unlockValue(ctx, site, anchors, new Map(), new Map()) > 0);
  assert.equal(unlockValue(ctx, ctx.v.base, anchors, new Map(), new Map()), 0);
});

test('a repair site is worth the cut needles it reconnects', () => {
  const probe = ctxOf('B', makeObs());
  const anchors = [probe.v.base, { q: 7, r: 5 }, { q: 5, r: 7 }];
  const cut = probe.v.ruins.find((r) => !probe.links.reach(r, anchors) && probe.v.cells.some((c) => probe.links.reach(c, anchors) && probe.links.ok(c, r)));
  assert.ok(cut);
  const needles = [...starts, { q: cut.q, r: cut.r, dark: true, fed: false, weight: 0 }];
  const ctx = ctxOf('B', makeObs({ t: 100, mine: { ...makeObs().mine, needles } }));
  const site = ctx.v.cells.find((c) => ctx.links.reach(c, anchors) && ctx.links.ok(c, cut));
  assert.ok(site);
  assert.ok(reconnectValue(ctx, site, anchors, new Map(), new Map()) > 0);
  assert.equal(reconnectValue(ctx, ctx.v.base, anchors, new Map(), new Map()), 0);
});

test('retaking a captured link is worth the branch it reconnects', () => {
  const probe = ctxOf('B', makeObs());
  const anchors = [probe.v.base, { q: 7, r: 5 }, { q: 5, r: 7 }];
  const link = probe.v.ruins.find((r) => probe.links.reach(r, anchors) && probe.v.ruins.some((x) => !probe.links.reach(x, anchors) && probe.links.ok(r, x)));
  assert.ok(link);
  const cut = probe.v.ruins.find((x) => !probe.links.reach(x, anchors) && probe.links.ok(link, x));
  assert.ok(cut);
  const needles = [...starts, { q: cut.q, r: cut.r, dark: true, fed: false, weight: 0 }];
  const own = [{ q: link.q, r: link.r, owner: 'A' as const, dark: false }];
  const units = [tkach('T-B6', 6, 6)];
  const ctx = ctxOf('B', makeObs({ t: 300, pulse: { ...makeObs().pulse, energy: 0 }, own, mine: { ...makeObs().mine, needles, units } }));
  const plain = ctxOf('B', makeObs({ t: 300, pulse: { ...makeObs().pulse, energy: 0 }, own, mine: { ...makeObs().mine, needles: starts, units } }));
  const valueOf = (c: typeof ctx): number => sites(c, [c.v.base, ...c.w.ownLit()], new Map(), new Map(), new Set()).find((s) => s.cell.q === link.q && s.cell.r === link.r)?.gain ?? 0;
  assert.ok(valueOf(ctx) > valueOf(plain));
});

test('a Tkach long out of link range heads to the nearest lit needle', () => {
  const ctx = ctxOf('B', makeObs({ t: 300, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 0, 0, { away: 33 })] } }));
  ctx.memo.res.set('T-B6', { kind: 'take', cell: { q: -5, r: 0 }, since: 250, sent: 250, owner: null });
  const tasks = expand(ctx);
  assert.equal(tasks.length, 1);
  const o = tasks[0]?.order;
  assert.equal(o?.kind, 'move');
  if (o?.kind === 'move') assert.ok((o.q === 7 && o.r === 5) || (o.q === 5 && o.r === 7));
  tasks[0]?.commit(ctx.memo, 300);
  assert.equal(ctx.memo.res.get('T-B6')?.kind, 'home');
});

test('a frozen Tkach gets no order', () => {
  const ctx = ctxOf('B', makeObs({ t: 300, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 0, 0, { away: 60, stuck: true })] } }));
  assert.equal(expand(ctx).length, 0);
});

test('standing on a target far longer than the heat takes gives it up for a while', () => {
  const ctx = ctxOf('B', makeObs({ t: 100, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 6, 6)] } }));
  const r0 = ctx.v.ruins[0];
  assert.ok(r0);
  const u = tkach('T-B6', r0.q, r0.r);
  const at = (t: number): typeof ctx => {
    const c = ctxOf('B', makeObs({ t, mine: { ...makeObs().mine, needles: starts, units: [u] } }));
    c.memo.res = ctx.memo.res;
    c.memo.banned = ctx.memo.banned;
    return c;
  };
  ctx.memo.res.set('T-B6', { kind: 'take', cell: r0, since: 90, sent: 90, owner: null, work: 8 });
  expand(at(100));
  assert.equal(ctx.memo.res.get('T-B6')?.arrived, 100);
  expand(at(115));
  assert.equal(ctx.memo.res.has('T-B6'), true);
  expand(at(125));
  assert.equal(ctx.memo.res.get('T-B6')?.cell === r0, false);
  assert.ok((ctx.memo.banned.get(keyOf(r0)) ?? 0) > 125);
});

test('a Tkach heating on target is not pulled home while the heat fits the leash', () => {
  const r0 = ctxOf('B', makeObs()).v.ruins[0];
  assert.ok(r0);
  const obs = makeObs({ t: 300, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', r0.q, r0.r, { away: 25 })] } });
  const ctx = ctxOf('B', obs);
  ctx.memo.res.set('T-B6', { kind: 'take', cell: r0, since: 280, sent: 280, owner: null, work: 8, arrived: 296 });
  assert.equal(expand(ctx).length, 0);
  const late = ctxOf('B', obs);
  late.memo.res.set('T-B6', { kind: 'take', cell: r0, since: 280, sent: 280, owner: null, work: 24, arrived: 299 });
  assert.equal(expand(late)[0]?.order.kind, 'move');
  late.memo.res.clear();
});

test('no target inside the Keeper line before dawn', () => {
  const ctx = ctxOf('B', makeObs({ t: 300, pulse: { ...makeObs().pulse, energy: 300 }, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 6, 6)] } }));
  const inner = { q: 2, r: 1 };
  ctx.w.owner.set('2,1', 'A');
  const all = sites(ctx, [ctx.v.base, ...ctx.w.ownLit(), { q: 4, r: 2 }], new Map(), new Map(), new Set());
  assert.ok(all.every((s) => Math.max(Math.abs(s.cell.q), Math.abs(s.cell.r), Math.abs(s.cell.q + s.cell.r)) > ctx.v.cherta));
  assert.ok(inner);
});

test('the leash counts the walk home', () => {
  const far = ctxOf('B', makeObs({ t: 300, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', -6, 12, { away: 22 })] } }));
  assert.equal(expand(far)[0]?.tag, 'expand:home');
  const near = ctxOf('B', makeObs({ t: 300, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 8, 8, { away: 22 })] } }));
  assert.ok(expand(near).every((t) => t.tag !== 'expand:home'));
});

test('a Tkach with leftover wait but no task can take an order', () => {
  const ctx = ctxOf('B', makeObs({ t: 30, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 6, 6, { wait: 2 })] } }));
  assert.equal(expand(ctx).length, 1);
});

test('ticks without hands do not count toward the overstay timeout', () => {
  const r0 = ctxOf('B', makeObs()).v.ruins[0];
  assert.ok(r0);
  const ctx = ctxOf('B', makeObs({ t: 125, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', r0.q, r0.r, { mute: true })] } }));
  ctx.memo.res.set('T-B6', { kind: 'take', cell: r0, since: 90, sent: 90, owner: null, work: 8, arrived: 100, muted: 10 });
  expand(ctx);
  assert.equal(ctx.memo.res.get('T-B6')?.cell, r0);
});

test('a refused stage or home order bans its cell for a while', () => {
  const ctx = ctxOf('B', makeObs({ t: 300, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 0, 0, { away: 33 })] } }));
  const home = expand(ctx)[0];
  assert.ok(home && home.tag === 'expand:home' && home.order.kind === 'move');
  home.commit(ctx.memo, 300);
  home.refused(ctx.memo, 12);
  assert.ok((ctx.memo.banned.get(home.order.q + ',' + home.order.r) ?? 0) > 300);
});

test('leaving a far site on the leash bans that site for a while', () => {
  const r0 = ctxOf('B', makeObs()).v.ruins[0];
  assert.ok(r0);
  const ctx = ctxOf('B', makeObs({ t: 300, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B6', 0, 0, { away: 33 })] } }));
  ctx.memo.res.set('T-B6', { kind: 'take', cell: r0, since: 250, sent: 250, owner: null, work: 8 });
  expand(ctx);
  assert.ok((ctx.memo.banned.get(keyOf(r0)) ?? 0) > 300);
});

test('no building while the Klinok guard is short', () => {
  const v = ctxOf('B', makeObs()).v;
  const own = v.ruins.map((c) => ({ q: c.q, r: c.r, owner: 'K' as const, dark: true }));
  const units = [tkach('T-B6', 6, 6), tkach('T-B7', 6, 7), tkach('T-B8', 7, 6)];
  const short = ctxOf('B', makeObs({ t: 200, pulse: { ...makeObs().pulse, energy: 100 }, own, mine: { ...makeObs().mine, needles: starts, units } }));
  assert.ok(expand(short).every((t) => t.order.kind !== 'needle'));
  const rich = ctxOf('B', makeObs({ t: 200, pulse: { ...makeObs().pulse, energy: 170 }, own, mine: { ...makeObs().mine, needles: starts, units } }));
  assert.ok(expand(rich).some((t) => t.order.kind === 'needle'));
});

test('with anticipate a Tkach sets off to build when the charge will be there on arrival', () => {
  const v = ctxOf('B', makeObs()).v;
  const own = v.ruins.map((c) => ({ q: c.q, r: c.r, owner: 'K' as const, dark: true }));
  const units = [tkach('T-B6', 6, 6), tkach('T-B7', 6, 7), tkach('T-B8', 7, 6)];
  const obs = makeObs({ t: 200, pulse: { ...makeObs().pulse, energy: 58 }, own, mine: { ...makeObs().mine, needles: starts, units } });
  assert.ok(expand(ctxOf('B', obs, 2026, presetOf('основний+guardFirst=0'))).every((t) => t.order.kind !== 'needle'));
  const ahead = expand(ctxOf('B', obs, 2026, presetOf('основний+guardFirst=0+anticipate=1'))).filter((t) => t.order.kind === 'needle');
  assert.equal(ahead.length, 1);
  const busy = ctxOf('B', obs, 2026, presetOf('основний+guardFirst=0+anticipate=1'));
  const [q, r] = target(ahead[0]?.order).split(',').map(Number);
  busy.memo.res.set('T-B8', { kind: 'build', cell: { q: q ?? 0, r: r ?? 0 }, since: 199, sent: 199, owner: null, work: 8 });
  assert.ok(expand(busy).every((t) => t.order.kind !== 'needle' || t.unit === 'T-B8'));
});
