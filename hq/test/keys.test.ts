import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fmtScore } from '../src/anchors.ts';
import { Diary } from '../src/model/diary.ts';
import { focusSlot } from '../src/model/names.ts';
import type { PackSummary } from '../src/model/names.ts';
import { Truth, diffCount, manifestNeedles, ownerTruth } from '../src/model/truth.ts';

const rec = (name: string): URL => new URL('../../records/reference/' + name, import.meta.url);
const pack = JSON.parse(readFileSync(rec('pack.json'), 'utf8')) as PackSummary;
const runlog = (n: number): Uint8Array => new Uint8Array(readFileSync(rec('match-' + n + '.runlog')));
const diary = (n: number): Diary => new Diary(readFileSync(rec('belief-' + n + '.ndjson'), 'utf8'));
const rosterOf = (n: number): string[] => {
  const slots = pack.rotations[n - 1] ?? [];
  return ['A', 'B', 'C'].map((s) => pack.roster[slots.indexOf(s)] ?? s);
};

test('Ш1 keys of seed 1 on match 2, tick 33', () => {
  const truth = new Truth(runlog(2)).at(33);
  const d = diary(2);
  const roster = rosterOf(2);
  assert.equal(ownerTruth(truth.owners, '1,13', roster), '-');
  assert.equal(d.ownerAt('1,13', 33, roster), '-');
  assert.deepEqual(d.ghost('K-2', 33), { cell: '2,4', age: 20 });
  const needles = manifestNeedles(runlog(2));
  assert.equal(diffCount(truth.owners, d.at(33).own, needles), 2);
  assert.equal(d.darkCount(33, needles), 0);
});

test('Ш2 keys of seed 1', () => {
  const t = new Truth(runlog(3));
  const slot = focusSlot(pack, 3);
  assert.equal(fmtScore(t.at(359).score[slot] ?? 0), '30.6');
  assert.equal(new Truth(runlog(2)).at(957 - 300).needles[focusSlot(pack, 2)], 17);
  const j = new Truth(runlog(2));
  j.at(1194);
  j.at(563);
  assert.equal(fmtScore(j.at(602).score[focusSlot(pack, 2)] ?? 0), '41.5');
});
