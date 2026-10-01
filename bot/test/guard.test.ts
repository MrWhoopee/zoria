import test from 'node:test';
import assert from 'node:assert/strict';
import type { MineUnit } from '@zoria/protocol';
import { guard } from '../src/plans/guard.ts';
import { presetOf } from '../src/preset.ts';

const strict = presetOf('основний+ramGrace=1+ramStill=1+ramTiming=1+chaseOff=1');
import { ctxOf } from './ctx.ts';
import { makeObs, tkach } from './obs.ts';

const starts = [{ q: 7, r: 5, dark: false, fed: false, weight: 1 }, { q: 5, r: 7, dark: false, fed: false, weight: 1 }];

function settled(obs: ReturnType<typeof makeObs>, preset = strict): ReturnType<typeof ctxOf> {
  const ctx = ctxOf('B', { ...obs, t: obs.t - 100, foe: [] }, 2026, preset);
  ctx.w.update({ ...obs, t: obs.t - 1 });
  ctx.w.update(obs);
  return ctx;
}

function klinok(id: string, q: number, r: number, over: Partial<MineUnit> = {}): MineUnit {
  return { ...tkach(id, q, r), cls: 'клинок', ...over };
}

test('a Klinok rams a foe Tkach standing on our needle', () => {
  const needles = [...starts, { q: 9, r: 3, dark: false, fed: false, weight: 1 }];
  const obs = makeObs({ t: 200, mine: { ...makeObs().mine, needles, units: [klinok('K-B7', 6, 6)] }, foe: [{ id: 'T-A3', p: 'A', cls: 'ткач', q: 9, r: 3 }] });
  const tasks = guard(settled(obs));
  assert.deepEqual(tasks[0]?.order, { kind: 'ram', unit: 'K-B7', target: 'T-A3' });
});

test('far foes, foe Klinoks and Keeper machines are left alone', () => {
  const foe = [
    { id: 'T-A3', p: 'A' as const, cls: 'ткач' as const, q: 0, r: -12 },
    { id: 'K-A4', p: 'A' as const, cls: 'клинок' as const, q: 7, r: 5 },
    { id: 'K-2', p: 'K' as const, cls: 'ткач' as const, q: 5, r: 7 },
  ];
  const obs = makeObs({ t: 200, mine: { ...makeObs().mine, needles: starts, units: [klinok('K-B7', 6, 6)] }, foe });
  assert.ok(guard(settled(obs)).every((t) => t.order.kind !== 'ram'));
});

test('a Klinok already chasing is not re-ordered', () => {
  const task = { goal: null, site: null, feed: null, jam: null, ram: 'T-A3', home: false, path: 1 };
  const needles = [...starts, { q: 9, r: 3, dark: false, fed: false, weight: 1 }];
  const obs = makeObs({ t: 200, mine: { ...makeObs().mine, needles, units: [klinok('K-B7', 6, 6, { task })] }, foe: [{ id: 'T-A3', p: 'A', cls: 'ткач', q: 9, r: 3 }] });
  assert.equal(guard(settled(obs)).length, 0);
});

test('an idle Klinok far from the network returns to a central needle', () => {
  const obs = makeObs({ t: 200, mine: { ...makeObs().mine, needles: starts, units: [klinok('K-B7', 0, 12)] } });
  const o = guard(settled(obs))[0]?.order;
  assert.equal(o?.kind, 'move');
  if (o?.kind === 'move') {
    assert.equal(o.home, true);
    assert.ok((o.q === 7 && o.r === 5) || (o.q === 5 && o.r === 7));
  }
});

test('a foe chased by a Klinok mid-step is not given to a second Klinok', () => {
  const chase = { goal: null, site: null, feed: null, jam: null, ram: 'T-A3', home: false, path: 2 };
  const units = [klinok('K-B7', 6, 7, { wait: 1, task: chase }), klinok('K-B8', 6, 6)];
  const obs = makeObs({ t: 200, mine: { ...makeObs().mine, needles: starts, units }, foe: [{ id: 'T-A3', p: 'A', cls: 'ткач', q: 7, r: 5 }] });
  assert.ok(guard(settled(obs)).every((t) => t.order.kind !== 'ram'));
});

test('a foe Tkach only passing by, or on a start needle it cannot heat, is not rammed', () => {
  const needles = [...starts, { q: 9, r: 3, dark: false, fed: false, weight: 1 }];
  const passing = makeObs({ t: 200, mine: { ...makeObs().mine, needles, units: [klinok('K-B7', 6, 6)] }, foe: [{ id: 'T-A3', p: 'A', cls: 'ткач', q: 9, r: 2 }] });
  assert.ok(guard(settled(passing)).every((t) => t.order.kind !== 'ram'));
  const onStart = makeObs({ t: 200, mine: { ...makeObs().mine, needles, units: [klinok('K-B7', 6, 6)] }, foe: [{ id: 'T-A3', p: 'A', cls: 'ткач', q: 7, r: 5 }] });
  assert.ok(guard(settled(onStart)).every((t) => t.order.kind !== 'ram'));
  const onOurs = makeObs({ t: 200, mine: { ...makeObs().mine, needles, units: [klinok('K-B7', 6, 6)] }, foe: [{ id: 'T-A3', p: 'A', cls: 'ткач', q: 9, r: 3 }] });
  assert.equal(guard(settled(onOurs))[0]?.order.kind, 'ram');
});

test('only a foe that stayed on a needle older than the capture grace is rammed', async () => {
  const { World } = await import('../src/world.ts');
  const needles = [...starts, { q: 9, r: 3, dark: false, fed: false, weight: 1 }];
  const foe = [{ id: 'T-A3', p: 'A' as const, cls: 'ткач' as const, q: 9, r: 3 }];
  const ctx = ctxOf('B', makeObs({ t: 100, mine: { ...makeObs().mine, needles, units: [klinok('K-B7', 6, 6)] }, foe }), 2026, strict);
  const fresh = new World(ctx.v);
  fresh.update(makeObs({ t: 99, mine: { ...makeObs().mine, needles: starts } }));
  fresh.update(makeObs({ t: 100, mine: { ...makeObs().mine, needles, units: [klinok('K-B7', 6, 6)] }, foe }));
  fresh.update(makeObs({ t: 101, mine: { ...makeObs().mine, needles, units: [klinok('K-B7', 6, 6)] }, foe }));
  assert.equal(guard({ ...ctx, w: fresh }).filter((t) => t.order.kind === 'ram').length, 0);
});

test('no ram when the Klinok would arrive as the heat completes', () => {
  const needles = [...starts, { q: 9, r: 3, dark: false, fed: false, weight: 1 }];
  const foe = [{ id: 'T-A3', p: 'A' as const, cls: 'ткач' as const, q: 9, r: 3 }];
  const base = makeObs({ t: 200, mine: { ...makeObs().mine, needles, units: [klinok('K-B7', 6, 6)] }, foe });
  const ctx = ctxOf('B', { ...base, t: 100, foe: [] }, 2026, strict);
  for (let t = 180; t <= 200; t++) ctx.w.update({ ...base, t });
  assert.equal(guard(ctx).filter((t) => t.order.kind === 'ram').length, 0);
  const early = ctxOf('B', { ...base, t: 100, foe: [] }, 2026, strict);
  for (let t = 195; t <= 200; t++) early.w.update({ ...base, t });
  assert.equal(guard(early).filter((t) => t.order.kind === 'ram').length, 1);
});

test('a chase is called off when the foe leaves our needle', () => {
  const needles = [...starts, { q: 9, r: 3, dark: false, fed: false, weight: 1 }];
  const chase = { goal: null, site: null, feed: null, jam: null, ram: 'T-A3', home: false, path: 2 };
  const walking = makeObs({ t: 200, mine: { ...makeObs().mine, needles, units: [klinok('K-B7', 7, 4, { task: chase })] }, foe: [{ id: 'T-A3', p: 'A', cls: 'ткач', q: 10, r: 1 }] });
  assert.deepEqual(guard(settled(walking)).map((t) => t.order), [{ kind: 'halt', unit: 'K-B7' }]);
  const gone = makeObs({ t: 200, mine: { ...makeObs().mine, needles, units: [klinok('K-B7', 7, 4, { task: chase })] } });
  assert.deepEqual(guard(settled(gone)).map((t) => t.order), [{ kind: 'halt', unit: 'K-B7' }]);
  const heating = makeObs({ t: 200, mine: { ...makeObs().mine, needles, units: [klinok('K-B7', 7, 4, { task: chase })] }, foe: [{ id: 'T-A3', p: 'A', cls: 'ткач', q: 9, r: 3 }] });
  assert.equal(guard(settled(heating)).length, 0);
});

test('by default the guard rams any foe standing on a needle we could lose', () => {
  const needles = [...starts, { q: 9, r: 3, dark: false, fed: false, weight: 1 }];
  const obs = makeObs({ t: 200, mine: { ...makeObs().mine, needles, units: [klinok('K-B7', 6, 6)] }, foe: [{ id: 'T-A3', p: 'A', cls: 'ткач', q: 9, r: 3 }] });
  assert.equal(guard(ctxOf('B', obs)).filter((t) => t.order.kind === 'ram').length, 1);
});

test('a foe Klinok next to a dark needle of ours is rammed as a jammer', () => {
  const needles = [...starts, { q: 9, r: 3, dark: true, fed: false, weight: 0 }];
  const obs = makeObs({ t: 200, mine: { ...makeObs().mine, needles, units: [klinok('K-B7', 6, 6)] }, foe: [{ id: 'K-C4', p: 'C', cls: 'клинок', q: 10, r: 3 }] });
  const jam = presetOf('основний+ramJammers=1');
  assert.equal(guard(ctxOf('B', obs)).filter((t) => t.order.kind === 'ram').length, 0);
  assert.deepEqual(guard(ctxOf('B', obs, 2026, jam)).find((t) => t.order.kind === 'ram')?.order, { kind: 'ram', unit: 'K-B7', target: 'K-C4' });
  const lit = [...starts, { q: 9, r: 3, dark: false, fed: false, weight: 1 }];
  const calm = makeObs({ t: 200, mine: { ...makeObs().mine, needles: lit, units: [klinok('K-B7', 6, 6)] }, foe: [{ id: 'K-C4', p: 'C', cls: 'клинок', q: 10, r: 3 }] });
  assert.equal(guard(ctxOf('B', calm, 2026, jam)).filter((t) => t.order.kind === 'ram').length, 0);
});

test('with ramIntruders a foe Tkach working next to our network is rammed, one walking past or far away is not', () => {
  const needles = [...starts, { q: 9, r: 3, dark: false, fed: false, weight: 1 }];
  const units = [klinok('K-B7', 6, 6)];
  const near = [{ id: 'T-A3', p: 'A' as const, cls: 'ткач' as const, q: 10, r: 1 }];
  const far = [{ id: 'T-A4', p: 'A' as const, cls: 'ткач' as const, q: 0, r: -12 }];
  const on = presetOf('глушій+ramIntruders=1');
  const still = makeObs({ t: 200, mine: { ...makeObs().mine, needles, units }, foe: near });
  assert.deepEqual(guard(settled(still, on))[0]?.order, { kind: 'ram', unit: 'K-B7', target: 'T-A3' });
  assert.ok(guard(settled(still, presetOf('глушій'))).every((t) => t.order.kind !== 'ram'));
  assert.ok(guard(settled(makeObs({ t: 200, mine: { ...makeObs().mine, needles, units }, foe: far }), on)).every((t) => t.order.kind !== 'ram'));
  const ctx = ctxOf('B', makeObs({ t: 199, mine: { ...makeObs().mine, needles, units }, foe: [{ ...near[0]!, q: 11, r: 0 }] }), 2026, on);
  ctx.w.update(still);
  assert.ok(guard(ctx).every((t) => t.order.kind !== 'ram'));
});

test('a foe Tkach on our needle is rammed before an intruder', () => {
  const needles = [...starts, { q: 9, r: 3, dark: false, fed: false, weight: 1 }];
  const foe = [{ id: 'T-A1', p: 'A' as const, cls: 'ткач' as const, q: 10, r: 1 }, { id: 'T-A9', p: 'A' as const, cls: 'ткач' as const, q: 9, r: 3 }];
  const obs = makeObs({ t: 200, mine: { ...makeObs().mine, needles, units: [klinok('K-B7', 6, 6)] }, foe });
  assert.deepEqual(guard(settled(obs, presetOf('глушій+ramIntruders=1')))[0]?.order, { kind: 'ram', unit: 'K-B7', target: 'T-A9' });
});

test('with dawnEscort after dawn a foe Tkach heating a ring needle is rammed and idle Klinoks post at the ring', () => {
  const v = ctxOf('B', makeObs()).v;
  const ring = [...v.ring].sort((a, b) => Math.max(Math.abs(a.q - 6), Math.abs(a.r - 6)) - Math.max(Math.abs(b.q - 6), Math.abs(b.r - 6)))[0]!;
  const foe = [{ id: 'T-A3', p: 'A' as const, cls: 'ткач' as const, q: ring.q, r: ring.r }];
  const units = [klinok('K-B7', 6, 6)];
  const on = presetOf('глушій+dawnEscort=1');
  const after = makeObs({ t: 1010, mine: { ...makeObs().mine, needles: starts, units }, foe });
  assert.deepEqual(guard(settled(after, on))[0]?.order, { kind: 'ram', unit: 'K-B7', target: 'T-A3' });
  assert.ok(guard(settled(after, presetOf('глушій'))).every((t) => t.order.kind !== 'ram'));
  assert.ok(guard(settled({ ...after, t: 990 }, on)).every((t) => t.order.kind !== 'ram'));
  const idle = makeObs({ t: 1010, mine: { ...makeObs().mine, needles: starts, units } });
  const o = guard(settled(idle, on))[0]?.order;
  assert.equal(o?.kind, 'move');
  if (o?.kind === 'move') assert.ok(v.ring.some((c) => Math.max(Math.abs(c.q - o.q), Math.abs(c.r - o.r), Math.abs(c.q + c.r - o.q - o.r)) <= 1));
});
