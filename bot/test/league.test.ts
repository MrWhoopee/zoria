import test from 'node:test';
import assert from 'node:assert/strict';
import { jobs, trios } from '../tools/league/jobs.ts';
import { kindOf, seatOf } from '../tools/league/roster.ts';
import { headToHead, standings, worst } from '../tools/league/table.ts';
import type { Breakdown, PackRecord } from '../tools/league/table.ts';

test('names resolve to seat kinds', () => {
  assert.equal(kindOf('основний'), 'preset');
  assert.equal(kindOf('рівний'), 'archetype');
  assert.equal(kindOf('облягач+pirate=1+klinok=1'), 'mutant');
  assert.equal(kindOf('черепаха'), 'nakaz');
  assert.throws(() => kindOf('хтозна'));
  assert.throws(() => seatOf('рівний+pirate'));
});

test('mutants copy the archetype and override knobs', () => {
  const s = seatOf('облягач+pirate=1+klinok=0.25');
  assert.equal(s.style?.['pirate'], 1);
  assert.equal(s.style?.['klinok'], 0.25);
  assert.notEqual(seatOf('облягач').style?.['pirate'], 1);
  assert.equal(typeof seatOf('основний').bot, 'function');
  assert.equal(typeof seatOf('черепаха').bot, 'function');
});

test('trios keep at least one player, sorted and without duplicates', () => {
  const t = trios(['p'], ['a', 'b', 'c']);
  assert.deepEqual(t, [['a', 'b', 'p'], ['a', 'c', 'p'], ['b', 'c', 'p']]);
  assert.equal(trios(['p', 'q'], ['a', 'b', 'c']).length, 9);
  assert.equal(trios(['p', 'a'], ['a', 'b']).length, 1);
  assert.deepEqual(jobs([['a', 'b', 'p']], [100, 101]).map((j) => j.seed), [100, 101]);
});

const zero: Breakdown = { network: 0, orders: 0, stolen: 0, jams: 0, rams: 0, pactTax: 0 };

function rec(seed: number, cast: [string, string, string], shares: [number, number, number]): PackRecord {
  return { seed, cast, shares, matches: [{ score: [100, 90, 80], breakdown: [{ ...zero, network: 100 }, zero, zero] }] };
}

test('standings, head to head and worst packs', () => {
  const rs = [rec(1, ['a', 'b', 'p'], [3, 2, 4]), rec(2, ['a', 'c', 'p'], [6, 1, 2]), rec(3, ['b', 'c', 'p'], [4, 2, 3])];
  const st = standings(rs);
  const p = st.find((s) => s.name === 'p');
  assert.ok(p);
  assert.equal(p.packs, 3);
  assert.equal(p.shares, 9);
  assert.equal(p.mean, 3);
  assert.equal(p.firsts, 1);
  const a = st.find((s) => s.name === 'a');
  assert.equal(a?.network, 100);
  assert.equal(st[0]?.name, 'a');
  assert.deepEqual(headToHead(rs, 'p', 'a'), { packs: 2, diff: -1.5 });
  assert.deepEqual(headToHead(rs, 'p', 'z'), { packs: 0, diff: 0 });
  assert.deepEqual(worst(rs, 'p', 2).map((r) => r.seed), [2, 3]);
});
