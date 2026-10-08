import test from 'node:test';
import assert from 'node:assert/strict';
import { cutLoss } from '../src/map/cut.ts';
import { keyOf } from '../src/hex.ts';
import type { Cell } from '../src/hex.ts';

const c = (q: number, r: number): Cell => ({ q, r });
const edges = (pairs: [Cell, Cell][]) => {
  const s = new Set(pairs.flatMap(([a, b]) => [keyOf(a) + '|' + keyOf(b), keyOf(b) + '|' + keyOf(a)]));
  return (a: Cell, b: Cell): boolean => s.has(keyOf(a) + '|' + keyOf(b));
};

test('a trunk needle that carries a branch loses the whole branch', () => {
  const base = c(0, 0);
  const trunk = c(1, 0);
  const branch = [c(2, 0), c(3, 0), c(4, 0)];
  const side = c(0, 1);
  const ok = edges([[base, trunk], [trunk, branch[0]!], [branch[0]!, branch[1]!], [branch[1]!, branch[2]!], [base, side]]);
  const loss = cutLoss(base, [trunk, ...branch, side], ok);
  assert.equal(loss.get(keyOf(trunk)), 3);
  assert.equal(loss.get(keyOf(side)), 0);
  assert.equal(loss.get(keyOf(branch[2]!)), 0);
});

test('a ring of links makes every needle safe to lose', () => {
  const base = c(0, 0);
  const a = c(1, 0);
  const b = c(2, 0);
  const d = c(0, 1);
  const ok = edges([[base, a], [a, b], [base, d], [d, b]]);
  const loss = cutLoss(base, [a, b, d], ok);
  assert.deepEqual([...loss.values()], [0, 0, 0]);
});
