import test from 'node:test';
import assert from 'node:assert/strict';
import { presetOf } from '../src/preset.ts';
import { yard } from '../src/plans/yard.ts';
import { ctxOf } from './ctx.ts';
import { makeObs, tkach } from './obs.ts';

test('orders a Tkach when energy allows and the swarm is short', () => {
  const ctx = ctxOf('B', makeObs({ t: 1 }));
  const tasks = yard(ctx);
  assert.equal(tasks.length, 1);
  assert.deepEqual(tasks[0]?.order, { kind: 'yard', cls: 'ткач' });
  assert.equal(tasks[0]?.energy, 90);
});

test('a pending hull counts toward the target', () => {
  const ctx = ctxOf('B', makeObs({ t: 1, pulse: { ...makeObs().pulse, energy: 300 } }));
  const first = yard(ctx)[0];
  assert.ok(first);
  first.commit(ctx.memo, 1);
  first.commit(ctx.memo, 1);
  first.commit(ctx.memo, 1);
  assert.deepEqual(yard(ctx)[0]?.order, { kind: 'yard', cls: 'клинок' });
});

test('pending hulls expire after the build time', () => {
  const ctx = ctxOf('B', makeObs({ t: 1, pulse: { ...makeObs().pulse, energy: 300 } }));
  ctx.memo.pendingYard = [{ cls: 'ткач', eta: 6 }, { cls: 'ткач', eta: 6 }, { cls: 'ткач', eta: 6 }];
  ctx.w.t = 6;
  assert.equal(yard(ctx).length, 1);
});

test('no order without energy or with three Tkachs', () => {
  assert.equal(yard(ctxOf('B', makeObs({ pulse: { ...makeObs().pulse, energy: 89 } }))).length, 0);
  const units = [tkach('T-B1', 6, 6), tkach('T-B2', 6, 7), tkach('T-B3', 7, 6)];
  const noK = { ...presetOf('основний'), klinokTarget: 0 };
  assert.equal(yard(ctxOf('B', makeObs({ pulse: { ...makeObs().pulse, energy: 300 }, mine: { ...makeObs().mine, units } }), 2026, noK)).length, 0);
});

test('a refused yard order frees the pending slot', () => {
  const ctx = ctxOf('B', makeObs({ t: 1 }));
  const task = yard(ctx)[0];
  assert.ok(task);
  task.commit(ctx.memo, 1);
  task.refused(ctx.memo, 9);
  assert.equal(ctx.memo.pendingYard.length, 0);
});

test('with the Tkachs in place the yard adds a Klinok', () => {
  const units = [tkach('T-B1', 6, 6), tkach('T-B2', 6, 7), tkach('T-B3', 7, 6)];
  const tasks = yard(ctxOf('B', makeObs({ pulse: { ...makeObs().pulse, energy: 60 }, mine: { ...makeObs().mine, units } })));
  assert.deepEqual(tasks[0]?.order, { kind: 'yard', cls: 'клинок' });
  assert.equal(tasks[0]?.energy, 50);
  const withK = [...units, { ...tkach('K-B4', 6, 6), cls: 'клинок' as const }];
  assert.equal(yard(ctxOf('B', makeObs({ pulse: { ...makeObs().pulse, energy: 300 }, mine: { ...makeObs().mine, units: withK } }))).length, 0);
});
