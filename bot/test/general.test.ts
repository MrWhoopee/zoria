import test from 'node:test';
import type { MineUnit } from '@zoria/protocol';
import assert from 'node:assert/strict';
import { GENERAL_VALUE, applyCommand, general, newGeneral, note, reserved } from '../src/general.ts';
import { newMemo } from '../src/plans/types.ts';
import { ctxOf } from './ctx.ts';
import { makeObs, tkach } from './obs.ts';

test('take and release move a unit in and out of manual control', () => {
  const g = newGeneral();
  applyCommand(g, { kind: 'take', unit: 'K-B7' }, 10);
  assert.deepEqual([...g.manual], ['K-B7']);
  applyCommand(g, { kind: 'order', order: { kind: 'halt', unit: 'K-B7' } }, 10);
  applyCommand(g, { kind: 'release', unit: 'K-B7' }, 11);
  assert.equal(g.manual.size, 0);
  assert.equal(g.queue.size, 0);
});

test('an order for a unit not under manual control takes it first', () => {
  const g = newGeneral();
  applyCommand(g, { kind: 'order', order: { kind: 'move', unit: 'T-B2', q: 3, r: 4, goal: null, home: false } }, 5);
  assert.ok(g.manual.has('T-B2'));
  assert.deepEqual(g.queue.get('T-B2'), { kind: 'move', unit: 'T-B2', q: 3, r: 4, goal: null, home: false });
});

test('orders without a unit are ignored with a note', () => {
  const g = newGeneral();
  applyCommand(g, { kind: 'order', order: { kind: 'yard', cls: 'ткач' } }, 5);
  assert.equal(g.queue.size, 0);
  assert.equal(g.notes.length, 1);
});

test('goals get ids, cancel removes them, reserved covers manual and goal units', () => {
  const g = newGeneral();
  applyCommand(g, { kind: 'goal', goal: 'jam', cell: { q: 5, r: -8 } }, 20);
  applyCommand(g, { kind: 'goal', goal: 'ram', target: 'T-A3' }, 21);
  assert.deepEqual(g.goals.map((x) => [x.id, x.kind, x.cell, x.target, x.unit, x.since]), [[1, 'jam', { q: 5, r: -8 }, null, null, 20], [2, 'ram', null, 'T-A3', null, 21]]);
  const first = g.goals[0];
  if (first) first.unit = 'K-B7';
  applyCommand(g, { kind: 'take', unit: 'T-B1' }, 22);
  assert.deepEqual([...reserved(g)].sort(), ['K-B7', 'T-B1']);
  applyCommand(g, { kind: 'cancel', id: 1 }, 23);
  assert.deepEqual(g.goals.map((x) => x.id), [2]);
});

test('a goal without its cell or target is ignored with a note', () => {
  const g = newGeneral();
  applyCommand(g, { kind: 'goal', goal: 'build' }, 1);
  applyCommand(g, { kind: 'goal', goal: 'ram' }, 1);
  assert.equal(g.goals.length, 0);
  assert.equal(g.notes.length, 2);
});

test('yard sets and clears the next class, notes keep the last twenty', () => {
  const g = newGeneral();
  applyCommand(g, { kind: 'yard', cls: 'клинок' }, 1);
  assert.equal(g.yardNext, 'клинок');
  applyCommand(g, { kind: 'yard', cls: null }, 2);
  assert.equal(g.yardNext, null);
  for (let i = 0; i < 25; i++) note(g, 'n' + i);
  assert.equal(g.notes.length, 20);
  assert.equal(g.notes[0], 'n5');
});

test('a new memo carries an empty general', () => {
  const g = newMemo().general;
  assert.deepEqual([g.manual.size, g.queue.size, g.goals.length, g.yardNext, g.notes.length], [0, 0, 0, null, 0]);
});

const starts = [{ q: 7, r: 5, dark: false, fed: false, weight: 1 }, { q: 5, r: 7, dark: false, fed: false, weight: 1 }];
const withUnits = (units: ReturnType<typeof tkach>[], t = 50) => makeObs({ t, mine: { ...makeObs().mine, needles: starts, units } });

test('a queued manual order goes out once with the top value and is cleared on commit', () => {
  const ctx = ctxOf('B', withUnits([tkach('T-B1', 6, 6)]));
  applyCommand(ctx.memo.general, { kind: 'order', order: { kind: 'move', unit: 'T-B1', q: 4, r: 4, goal: null, home: false } }, 50);
  const tasks = general(ctx);
  assert.deepEqual(tasks.map((x) => [x.tag, x.unit, x.order.kind, x.value]), [['general:order', 'T-B1', 'move', GENERAL_VALUE]]);
  tasks[0]?.commit(ctx.memo, 50);
  assert.deepEqual(general(ctx), []);
  assert.ok(ctx.memo.general.manual.has('T-B1'));
});

test('a refused manual order is dropped with a note', () => {
  const ctx = ctxOf('B', withUnits([tkach('T-B1', 6, 6)]));
  applyCommand(ctx.memo.general, { kind: 'order', order: { kind: 'needle', unit: 'T-B1', q: 0, r: 0 } }, 50);
  general(ctx)[0]?.refused(ctx.memo, 11);
  assert.equal(ctx.memo.general.queue.size, 0);
  assert.match(ctx.memo.general.notes.at(-1) ?? '', /needle/);
});

test('orders for a unit that is gone are dropped with a note and the unit released', () => {
  const ctx = ctxOf('B', withUnits([]));
  applyCommand(ctx.memo.general, { kind: 'order', order: { kind: 'halt', unit: 'K-B9' } }, 50);
  assert.deepEqual(general(ctx), []);
  assert.equal(ctx.memo.general.manual.size, 0);
  assert.equal(ctx.memo.general.notes.length, 1);
});

function klinok(id: string, q: number, r: number, over: Partial<MineUnit> = {}): MineUnit {
  return { ...tkach(id, q, r), cls: 'клинок', ...over };
}

const foeNeedle = { q: 5, r: -8, owner: 'A' as const, dark: false };

test('a jam goal sends the nearest free Klinok to the needle and then holds it', () => {
  const far = makeObs({ t: 60, mine: { ...makeObs().mine, needles: starts, units: [klinok('K-B7', 5, -2), klinok('K-B8', 6, 6), tkach('T-B1', 5, -3)] }, own: [foeNeedle] });
  const ctx = ctxOf('B', far);
  applyCommand(ctx.memo.general, { kind: 'goal', goal: 'jam', cell: { q: 5, r: -8 } }, 60);
  assert.deepEqual(general(ctx).map((x) => [x.tag, x.unit, x.order]), [['general:jam', 'K-B7', { kind: 'move', unit: 'K-B7', q: 5, r: -8, goal: null, home: false }]]);
  ctx.w.update(makeObs({ t: 61, mine: { ...makeObs().mine, needles: starts, units: [klinok('K-B7', 5, -7), klinok('K-B8', 6, 6)] }, own: [foeNeedle] }));
  assert.deepEqual(general(ctx)[0]?.order, { kind: 'jam', unit: 'K-B7', target: { q: 5, r: -8 }, hold: true });
});

test('a jam goal on a needle that is no longer a foe one is done', () => {
  const ctx = ctxOf('B', makeObs({ t: 60, mine: { ...makeObs().mine, needles: starts, units: [klinok('K-B7', 5, -7)] }, own: [{ ...foeNeedle, owner: 'B' }] }));
  applyCommand(ctx.memo.general, { kind: 'goal', goal: 'jam', cell: { q: 5, r: -8 } }, 60);
  assert.deepEqual(general(ctx), []);
  assert.equal(ctx.memo.general.goals.length, 0);
});

test('a ram goal chases a visible foe and is dropped after it stays out of sight', () => {
  const foe = [{ id: 'T-A3', p: 'A' as const, cls: 'ткач' as const, q: 7, r: 2 }];
  const ctx = ctxOf('B', makeObs({ t: 60, mine: { ...makeObs().mine, needles: starts, units: [klinok('K-B7', 6, 6)] }, foe }));
  applyCommand(ctx.memo.general, { kind: 'goal', goal: 'ram', target: 'T-A3' }, 60);
  assert.deepEqual(general(ctx)[0]?.order, { kind: 'ram', unit: 'K-B7', target: 'T-A3' });
  ctx.w.update(makeObs({ t: 70, mine: { ...makeObs().mine, needles: starts, units: [klinok('K-B7', 6, 6)] } }));
  assert.equal(general(ctx).length, 0);
  assert.equal(ctx.memo.general.goals.length, 1);
  ctx.w.update(makeObs({ t: 81, mine: { ...makeObs().mine, needles: starts, units: [klinok('K-B7', 6, 6)] } }));
  general(ctx);
  assert.equal(ctx.memo.general.goals.length, 0);
});

test('a build goal sends an idle Tkach and ends when our needle stands there', () => {
  const ctx = ctxOf('B', withUnits([tkach('T-B1', 6, 6), klinok('K-B7', 9, 2)]));
  applyCommand(ctx.memo.general, { kind: 'goal', goal: 'build', cell: { q: 9, r: 2 } }, 50);
  assert.deepEqual(general(ctx)[0]?.order, { kind: 'needle', unit: 'T-B1', q: 9, r: 2 });
  ctx.w.update(makeObs({ t: 70, mine: { ...makeObs().mine, needles: [...starts, { q: 9, r: 2, dark: false, fed: false, weight: 1 }], units: [tkach('T-B1', 9, 2)] } }));
  assert.deepEqual(general(ctx), []);
  assert.equal(ctx.memo.general.goals.length, 0);
});

test('manual units and units on other goals are never picked for a goal', () => {
  const ctx = ctxOf('B', makeObs({ t: 60, mine: { ...makeObs().mine, needles: starts, units: [klinok('K-B7', 5, -7), klinok('K-B8', 6, 6)] }, own: [foeNeedle] }));
  applyCommand(ctx.memo.general, { kind: 'take', unit: 'K-B7' }, 60);
  applyCommand(ctx.memo.general, { kind: 'goal', goal: 'jam', cell: { q: 5, r: -8 } }, 60);
  assert.equal(general(ctx)[0]?.unit, 'K-B8');
});

test('a jam goal on a shielded start needle is dropped with a note', () => {
  const ctx = ctxOf('B', makeObs({ t: 60, mine: { ...makeObs().mine, needles: starts, units: [klinok('K-B7', 6, 6)] }, own: [{ q: 7, r: -13, owner: 'A' as const, dark: false }] }));
  const start = ctx.v.starts.find((s) => s.slot === 'A')?.cell;
  assert.ok(start);
  ctx.w.update(makeObs({ t: 61, mine: { ...makeObs().mine, needles: starts, units: [klinok('K-B7', 6, 6)] }, own: [{ q: start.q, r: start.r, owner: 'A' as const, dark: false }] }));
  applyCommand(ctx.memo.general, { kind: 'goal', goal: 'jam', cell: start }, 61);
  assert.deepEqual(general(ctx), []);
  assert.equal(ctx.memo.general.goals.length, 0);
  assert.match(ctx.memo.general.notes.at(-1) ?? '', /щит/);
});

test('a parked unit with a finished move still takes a goal and acts on it', () => {
  const parked = { goal: { q: 6, r: 6 }, site: null, feed: null, jam: null, ram: null, home: false, path: 0 };
  const ctx = ctxOf('B', withUnits([tkach('T-B1', 6, 6, { task: parked })]));
  applyCommand(ctx.memo.general, { kind: 'goal', goal: 'build', cell: { q: 9, r: 2 } }, 50);
  assert.deepEqual(general(ctx)[0]?.order, { kind: 'needle', unit: 'T-B1', q: 9, r: 2 });
});

test('a goal lets go of a unit the owner takes and finds another', () => {
  const foe = [{ id: 'T-A3', p: 'A' as const, cls: 'ткач' as const, q: 7, r: 2 }];
  const ctx = ctxOf('B', makeObs({ t: 60, mine: { ...makeObs().mine, needles: starts, units: [klinok('K-B7', 6, 6), klinok('K-B8', 5, 7)] }, foe }));
  applyCommand(ctx.memo.general, { kind: 'goal', goal: 'ram', target: 'T-A3' }, 60);
  assert.equal(general(ctx)[0]?.unit, 'K-B7');
  applyCommand(ctx.memo.general, { kind: 'take', unit: 'K-B7' }, 61);
  const next = general(ctx).filter((t) => t.tag === 'general:ram');
  assert.deepEqual(next.map((t) => t.unit), ['K-B8']);
});

test('a refused goal order drops the goal with a note', () => {
  const ctx = ctxOf('B', withUnits([tkach('T-B1', 6, 6)]));
  applyCommand(ctx.memo.general, { kind: 'goal', goal: 'build', cell: { q: 9, r: 2 } }, 50);
  general(ctx)[0]?.refused(ctx.memo, 11);
  assert.equal(ctx.memo.general.goals.length, 0);
  assert.match(ctx.memo.general.notes.at(-1) ?? '', /відмова/);
});

test('a take goal sends the nearest free Tkach to heat the needle and ends once it is ours', () => {
  const ctx = ctxOf('B', makeObs({ t: 60, mine: { ...makeObs().mine, needles: starts, units: [tkach('T-B1', 5, -2), tkach('T-B2', 6, 6), klinok('K-B7', 5, -7)] }, own: [foeNeedle] }));
  applyCommand(ctx.memo.general, { kind: 'goal', goal: 'take', cell: { q: 5, r: -8 } }, 60);
  assert.deepEqual(general(ctx).map((x) => [x.tag, x.order]), [['general:take', { kind: 'move', unit: 'T-B1', q: 5, r: -8, goal: { q: 5, r: -8 }, home: false }]]);
  ctx.w.update(makeObs({ t: 90, mine: { ...makeObs().mine, needles: [...starts, { q: 5, r: -8, dark: false, fed: false, weight: 1 }], units: [tkach('T-B1', 5, -8), tkach('T-B2', 6, 6)] }, own: [{ ...foeNeedle, owner: 'B' }] }));
  assert.deepEqual(general(ctx), []);
  assert.equal(ctx.memo.general.goals.length, 0);
});
