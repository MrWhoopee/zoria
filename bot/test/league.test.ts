import test from 'node:test';
import assert from 'node:assert/strict';
import { jobs, trios } from '../tools/league/jobs.ts';
import { fileSafe, kindOf, seatOf } from '../tools/league/roster.ts';
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
  assert.deepEqual(jobs([['a', 'b', 'p']], [100], true).map((j) => j.cast), [['a', 'b', 'p'], ['p', 'b', 'a']]);
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

test('report lists standings and head to head for players', async () => {
  const { report, readRecords } = await import('../tools/league/report.ts');
  const rs = [rec(1, ['основний', 'рівний', 'шир'], [5, 2, 2])];
  const back = readRecords(rs.map((r) => JSON.stringify(r)).join('\n') + '\n');
  assert.deepEqual(back, rs);
  const lines = report(back, ['основний']);
  assert.ok(lines.some((l) => l.startsWith('основний [preset]')));
  assert.ok(lines.some((l) => l.includes('рівний') && l.includes('+3.00')));
});

test('pending skips packs already played', async () => {
  const { pending } = await import('../tools/league/jobs.ts');
  const all = jobs([['a', 'b', 'p'], ['a', 'c', 'p']], [1, 2]);
  const left = pending(all, [{ seed: 1, cast: ['a', 'b', 'p'] }, { seed: 2, cast: ['a', 'c', 'p'] }]);
  assert.deepEqual(left.map((j) => j.seed + j.cast.join('')), ['2abp', '1acp']);
});

test('schedules resolve to preset seats, mixed ones are refused', () => {
  assert.equal(kindOf('загарбник'), 'preset');
  assert.equal(kindOf('широкий>глушій+klinokTarget=6@400'), 'preset');
  assert.equal(typeof seatOf('маятник').bot, 'function');
  assert.throws(() => kindOf('основний>рівний@300'));
  assert.throws(() => kindOf('рівний>основний@300'));
  assert.throws(() => kindOf('облягач+pirate=1>основний@300'));
  assert.throws(() => kindOf('широкий>глушій@0'));
});

test('participant names become safe file names on Windows', () => {
  assert.equal(fileSafe('глушій>широкий@300-рівний'), 'глушій_широкий@300-рівний');
  assert.equal(fileSafe('a<b:c"d/e\\f|g?h*i'), 'a_b_c_d_e_f_g_h_i');
  assert.equal(fileSafe('скупий+steal=0'), 'скупий+steal=0');
});
