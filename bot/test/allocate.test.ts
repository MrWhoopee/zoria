import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate } from '../src/allocate.ts';
import type { Task } from '../src/plans/types.ts';

function task(tag: string, value: number, bytes: number, unit: string | null = null, energy = 0): Task {
  return { tag, unit, order: { kind: 'halt', unit: unit ?? 'x' }, value, bytes, energy, commit: () => undefined, refused: () => undefined };
}

test('picks by value within the channel of the tick', () => {
  const out = allocate([task('a', 1, 32), task('b', 5, 32), task('c', 3, 32)], { chan: 70, cap: 10, energy: 0, reserve: 0 });
  assert.deepEqual(out.map((t) => t.tag), ['b', 'c']);
});

test('busy units never block a command: commands are paid before hands', () => {
  const out = allocate([task('a', 5, 32, 'T1'), task('b', 4, 32, 'T2'), task('c', 3, 32, 'T3'), task('d', 2, 32, 'T4')], { chan: 141, cap: 10, energy: 0, reserve: 0 });
  assert.deepEqual(out.map((t) => t.tag), ['a', 'b', 'c', 'd']);
});

test('one task per unit, order cap and energy are respected', () => {
  const out = allocate([task('a', 5, 0, 'T1'), task('b', 4, 0, 'T1'), task('c', 3, 0, null, 90), task('d', 2, 0)], { chan: 500, cap: 2, energy: 80, reserve: 0 });
  assert.deepEqual(out.map((t) => t.tag), ['a', 'd']);
});

test('low-value tasks leave the hands of working units alone', () => {
  const out = allocate([task('work', 5, 32, 'T1'), task('post', 0.01, 32, 'K1')], { chan: 141, cap: 10, energy: 0, reserve: 96 });
  assert.deepEqual(out.map((t) => t.tag), ['work']);
  const roomy = allocate([task('post', 0.01, 32, 'K1')], { chan: 141, cap: 10, energy: 0, reserve: 64 });
  assert.deepEqual(roomy.map((t) => t.tag), ['post']);
});
