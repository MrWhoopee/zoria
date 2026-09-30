import test from 'node:test';
import assert from 'node:assert/strict';
import type { MineUnit } from '@zoria/protocol';
import { guard } from '../src/plans/guard.ts';
import { ctxOf } from './ctx.ts';
import { makeObs, tkach } from './obs.ts';

const starts = [{ q: 7, r: 5, dark: false, fed: false, weight: 1 }, { q: 5, r: 7, dark: false, fed: false, weight: 1 }];

function settled(obs: ReturnType<typeof makeObs>): ReturnType<typeof ctxOf> {
  const ctx = ctxOf('B', { ...obs, t: obs.t - 100, foe: [] });
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
  const obs = makeObs({ t: 200, mine: { ...makeObs().mine, needles: starts, units: [klinok('K-B7', 6, 6, { task })] }, foe: [{ id: 'T-A3', p: 'A', cls: 'ткач', q: 7, r: 5 }] });
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
  const ctx = ctxOf('B', makeObs({ t: 100, mine: { ...makeObs().mine, needles, units: [klinok('K-B7', 6, 6)] }, foe }));
  const fresh = new World(ctx.v);
  fresh.update(makeObs({ t: 99, mine: { ...makeObs().mine, needles: starts } }));
  fresh.update(makeObs({ t: 100, mine: { ...makeObs().mine, needles, units: [klinok('K-B7', 6, 6)] }, foe }));
  fresh.update(makeObs({ t: 101, mine: { ...makeObs().mine, needles, units: [klinok('K-B7', 6, 6)] }, foe }));
  assert.equal(guard({ ...ctx, w: fresh }).filter((t) => t.order.kind === 'ram').length, 0);
});
