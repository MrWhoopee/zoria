import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, newGeneral, note, reserved } from '../src/general.ts';
import { newMemo } from '../src/plans/types.ts';

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
