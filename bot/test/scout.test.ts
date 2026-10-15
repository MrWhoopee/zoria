import test from 'node:test';
import assert from 'node:assert/strict';
import { scout, centers } from '../src/plans/scout.ts';
import { disc, keyOf } from '../src/hex.ts';
import { inside } from '../src/map/valley.ts';
import { presetOf } from '../src/preset.ts';
import { ctxOf } from './ctx.ts';
import { makeObs } from './obs.ts';

const starts = [{ q: 7, r: 5, dark: false, fed: false, weight: 1 }, { q: 5, r: 7, dark: false, fed: false, weight: 1 }];

test('scout is off by default', () => {
  const obs = makeObs({ t: 200, mine: { ...makeObs().mine, needles: starts } });
  assert.equal(scout(ctxOf('B', obs)).length, 0);
});

test('the scan lattice covers every valley cell, and every center is inside the valley', () => {
  const ctx = ctxOf('B', makeObs());
  const covered = new Set(centers(ctx.v).flatMap((c) => disc(c, 3).map(keyOf)));
  assert.ok(ctx.v.cells.filter((c) => inside(ctx.v, c)).every((c) => covered.has(keyOf(c))));
  assert.ok(centers(ctx.v).every((c) => inside(ctx.v, c)));
});

test('with spare ears scout scans an unseen area near the network, paid from the ears only', () => {
  const obs = makeObs({ t: 200, mine: { ...makeObs().mine, needles: starts } });
  const tasks = scout(ctxOf('B', obs, 2026, presetOf('основний+scout=1')));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.order.kind, 'scan');
  assert.equal(tasks[0]?.bytes, 0);
});

test('without ears for a scan scout stays silent', () => {
  const obs = makeObs({ t: 200, pulse: { ...makeObs().pulse, ear: 100 }, mine: { ...makeObs().mine, needles: starts } });
  assert.equal(scout(ctxOf('B', obs, 2026, presetOf('основний+scout=1'))).length, 0);
});

test('a scanned area is not scanned again right away', () => {
  const obs = makeObs({ t: 200, mine: { ...makeObs().mine, needles: starts } });
  const ctx = ctxOf('B', obs, 2026, presetOf('основний+scout=1'));
  const first = scout(ctx)[0];
  first?.commit(ctx.memo, 200);
  const second = scout(ctx)[0];
  assert.notDeepEqual(second?.order, first?.order);
});

test('with orderJam, scout first scans the contract, once in a while', () => {
  const order = { cells: [{ q: 5, r: -8 }, { q: 5, r: -4 }, { q: 3, r: -6 }], from: 280, to: 370, bonus: 30, holdTicks: 12 };
  const obs = makeObs({ t: 300, pub: { ...makeObs().pub, order }, mine: { ...makeObs().mine, needles: starts } });
  const ctx = ctxOf('B', obs, 2026, presetOf('основний+scout=1+orderJam=1'));
  const first = scout(ctx)[0];
  assert.deepEqual(first?.order, { kind: 'scan', q: 5, r: -8, rad: 3 });
  first?.commit(ctx.memo, 300);
  assert.notDeepEqual(scout(ctx)[0]?.order, first?.order);
});
