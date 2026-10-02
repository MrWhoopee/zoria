import test from 'node:test';
import assert from 'node:assert/strict';
import { describe, divergence, review } from '../tools/arena/review.ts';
import type { ArenaRecord } from '../arena/record.ts';

const rec: ArenaRecord = {
  v: 1,
  at: '2026-10-02T12:00:00.000Z',
  seed: 10,
  slot: 'A',
  rivals: ['глушій', 'загарбник'],
  preset: 'глушій',
  commands: [
    { t: 3, c: { kind: 'take', unit: 'K-A7' } },
    { t: 3, c: { kind: 'order', order: { kind: 'move', unit: 'K-A7', q: 1, r: 2, goal: null, home: false } } },
    { t: 5, c: { kind: 'goal', goal: 'jam', cell: { q: 3, r: -8 } } },
    { t: 6, c: { kind: 'yard', cls: 'ткач' } },
  ],
  end: { t: 8, done: true, score: [30, 20, 10], place: 1 },
};

test('commands read as plain Ukrainian lines', () => {
  assert.deepEqual(rec.commands.map((x) => describe(x.c)), ['перехопив K-A7', 'K-A7: рух на 1,2', 'наказ боту: глушити 3,-8', 'верф: ткач']);
});

test('divergence is the first tick where our score differs', () => {
  assert.equal(divergence([[1, 1, 1], [2, 2, 2], [3, 3, 3]], [[1, 1, 1], [2, 2, 2], [4, 3, 3]], 0), 3);
  assert.equal(divergence([[1, 1, 1]], [[1, 1, 1]], 0), null);
});

test('the review compares the game with the bot playing alone', () => {
  const mine = { final: { score: [30, 20, 10], place: 1, t: 8 }, scores: [[1, 1, 1], [2, 1, 1], [3, 1, 1], [5, 1, 1], [8, 1, 1], [12, 1, 1], [20, 1, 1], [30, 20, 10]] };
  const alone = { final: { score: [18, 25, 10], place: 2, t: 8 }, scores: [[1, 1, 1], [2, 1, 1], [3, 1, 1], [4, 1, 1], [6, 1, 1], [9, 1, 1], [14, 1, 1], [18, 25, 10]] };
  const lines = review(rec, mine as never, alone as never);
  assert.ok(lines.some((l) => l.includes('жереб 10') && l.includes('слот A')));
  assert.ok(lines.some((l) => l.includes('з тобою: 30.0, місце 1') && l.includes('бот сам: 18.0, місце 2') && l.includes('+12.0')));
  assert.ok(lines.some((l) => l.includes('розходження з такту 4')));
  assert.ok(lines.some((l) => l.startsWith('  t5') && l.includes('глушити 3,-8')));
  assert.ok(lines.every((l) => !l.includes('не збігається')));
  const off = review({ ...rec, end: { t: 8, done: true, score: [31, 20, 10], place: 1 } }, mine as never, alone as never);
  assert.ok(off.some((l) => l.includes('не збігається')));
});
