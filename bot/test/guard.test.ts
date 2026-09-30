import test from 'node:test';
import assert from 'node:assert/strict';
import type { MineUnit } from '@zoria/protocol';
import { guard } from '../src/plans/guard.ts';
import { ctxOf } from './ctx.ts';
import { makeObs, tkach } from './obs.ts';

const starts = [{ q: 7, r: 5, dark: false, fed: false, weight: 1 }, { q: 5, r: 7, dark: false, fed: false, weight: 1 }];

function klinok(id: string, q: number, r: number, over: Partial<MineUnit> = {}): MineUnit {
  return { ...tkach(id, q, r), cls: 'клинок', ...over };
}

test('a Klinok rams a foe Tkach standing on our needle', () => {
  const obs = makeObs({ t: 200, mine: { ...makeObs().mine, needles: starts, units: [klinok('K-B7', 6, 6)] }, foe: [{ id: 'T-A3', p: 'A', cls: 'ткач', q: 7, r: 5 }] });
  const tasks = guard(ctxOf('B', obs));
  assert.deepEqual(tasks[0]?.order, { kind: 'ram', unit: 'K-B7', target: 'T-A3' });
});

test('far foes, foe Klinoks and Keeper machines are left alone', () => {
  const foe = [
    { id: 'T-A3', p: 'A' as const, cls: 'ткач' as const, q: 0, r: -12 },
    { id: 'K-A4', p: 'A' as const, cls: 'клинок' as const, q: 7, r: 5 },
    { id: 'K-2', p: 'K' as const, cls: 'ткач' as const, q: 5, r: 7 },
  ];
  const obs = makeObs({ t: 200, mine: { ...makeObs().mine, needles: starts, units: [klinok('K-B7', 6, 6)] }, foe });
  assert.ok(guard(ctxOf('B', obs)).every((t) => t.order.kind !== 'ram'));
});

test('a Klinok already chasing is not re-ordered', () => {
  const task = { goal: null, site: null, feed: null, jam: null, ram: 'T-A3', home: false, path: 1 };
  const obs = makeObs({ t: 200, mine: { ...makeObs().mine, needles: starts, units: [klinok('K-B7', 6, 6, { task })] }, foe: [{ id: 'T-A3', p: 'A', cls: 'ткач', q: 7, r: 5 }] });
  assert.equal(guard(ctxOf('B', obs)).length, 0);
});

test('an idle Klinok far from the network returns to a central needle', () => {
  const obs = makeObs({ t: 200, mine: { ...makeObs().mine, needles: starts, units: [klinok('K-B7', 0, 12)] } });
  const o = guard(ctxOf('B', obs))[0]?.order;
  assert.equal(o?.kind, 'move');
  if (o?.kind === 'move') {
    assert.equal(o.home, true);
    assert.ok((o.q === 7 && o.r === 5) || (o.q === 5 && o.r === 7));
  }
});
