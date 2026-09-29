import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate, busyHands } from '../src/allocate.ts';
import type { Task } from '../src/plans/types.ts';
import { tkach } from './obs.ts';

function task(tag: string, value: number, bytes: number, unit: string | null = null, hands = 0, energy = 0): Task {
  return { tag, unit, order: { kind: 'halt', unit: unit ?? 'x' }, value, bytes, hands, energy, commit: () => undefined, refused: () => undefined };
}

test('picks by value within the channel left after busy hands', () => {
  const out = allocate([task('a', 1, 32), task('b', 5, 32), task('c', 3, 32)], { chan: 141, busyHands: 64, cap: 10, energy: 0 });
  assert.deepEqual(out.map((t) => t.tag), ['b', 'c']);
});

test('counts the hands a newly busy unit will cost', () => {
  const out = allocate([task('a', 5, 32, 'T1', 32), task('b', 4, 32, 'T2', 32)], { chan: 141, busyHands: 0, cap: 10, energy: 0 });
  assert.deepEqual(out.map((t) => t.tag), ['a', 'b']);
  const tight = allocate([task('a', 5, 32, 'T1', 32), task('b', 4, 32, 'T2', 32)], { chan: 100, busyHands: 0, cap: 10, energy: 0 });
  assert.deepEqual(tight.map((t) => t.tag), ['a']);
});

test('one task per unit, order cap and energy are respected', () => {
  const out = allocate([task('a', 5, 0, 'T1'), task('b', 4, 0, 'T1'), task('c', 3, 0, null, 0, 90), task('d', 2, 0)], { chan: 500, busyHands: 0, cap: 2, energy: 80 });
  assert.deepEqual(out.map((t) => t.tag), ['a', 'd']);
});

test('busy hands count units with a task or work in progress', () => {
  const units = [tkach('T1', 0, 0), tkach('T2', 0, 0, { task: { goal: null, site: null, feed: null, jam: null, ram: null, home: false, path: 3 } }), tkach('T3', 0, 0, { work: 2 })];
  assert.equal(busyHands(units, 32), 64);
});
