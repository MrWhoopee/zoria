import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { derive, initial, packData } from '../src/model/derive.ts';
import type { PackData, View } from '../src/model/derive.ts';
import { Truth } from '../src/model/truth.ts';

const dir = (d: string, n: string): URL => new URL('../../records/' + d + '/' + n, import.meta.url);
const load = (d: string): PackData =>
  packData(d, readFileSync(dir(d, 'pack.json'), 'utf8'), [1, 2, 3].map((n) => new Uint8Array(readFileSync(dir(d, 'match-' + n + '.runlog')))), [1, 2, 3].map((n) => readFileSync(dir(d, 'belief-' + n + '.ndjson'), 'utf8')));

const ref = load('reference');
const a = load('preset-a');
const b = load('preset-b');
const truths = [1, 2, 3].map((n) => new Truth(new Uint8Array(readFileSync(dir('reference', 'match-' + n + '.runlog')))));
const at = (v: View) => truths[v.match - 1]?.at(v.tick) ?? null;

test('an empty view keeps every anchor empty but well formed', () => {
  const out = derive(initial(), null, null, null);
  assert.equal(out['tick'], '0');
  assert.equal(out['score'], '');
  assert.equal(out['promote-status'], '-');
  assert.equal(out['live-lag'], '-');
  assert.equal(out['live-state'], '-');
});

test('Ш1 anchors of seed 1 come out of derive', () => {
  const v: View = { ...initial(), pack: 'reference', match: 2, tick: 33, mode: 'belief', focus: 'nazar_k', cell: '1,13', unit: 'K-2' };
  const out = derive(v, ref, at(v), { a, b });
  assert.equal(out['cell-owner-truth'], '-');
  assert.equal(out['cell-owner-belief'], '-');
  assert.equal(out['ghost-cell'], '2,4');
  assert.equal(out['ghost-age'], '20');
  assert.equal(out['diff-count'], '2');
  assert.equal(out['dark-count'], '0');
  assert.equal(out['focus'], 'nazar_k');
  assert.equal(out['mode'], 'belief');
  assert.equal(out['match'], '2');
  assert.equal(out['cell'], '1,13');
  const none = derive({ ...v, unit: '-' }, ref, at(v), { a, b });
  assert.equal(none['ghost-cell'], '-');
  assert.equal(none['ghost-age'], '-');
});

test('Ш2, Ш3 and Ш4 anchors of seed 1 come out of derive', () => {
  const v: View = { ...initial(), pack: 'reference', match: 3, tick: 359, focus: 'nazar_k' };
  assert.equal(derive(v, ref, at(v), { a, b })['score'], '30.6');
  assert.equal(derive(v, ref, at(v), { a, b })['shares'], '6,6,6');
  const c: View = { ...initial(), pack: 'reference', match: 1, tick: 502, order: 0, focus: 'nazar_k' };
  const out = derive(c, ref, at(c), { a, b });
  assert.deepEqual([out['bytes'], out['orders'], out['denied'], out['deny-word'], out['deny-top-tick']], ['6', '1', '0', '-', '976']);
  const p: View = { ...initial(), pack: 'preset-a', match: 2, tick: 0 };
  const cmp = derive(p, a, null, { a, b });
  assert.deepEqual([cmp['ab-winner'], cmp['ab-diff'], cmp['ab-top']], ['preset-a', '12.6', 'network']);
});

test('a truth answer for another tick is not shown as this tick', () => {
  const v: View = { ...initial(), pack: 'reference', match: 3, tick: 359, focus: 'nazar_k' };
  const stale = truths[2]?.at(100) ?? null;
  assert.equal(derive(v, ref, stale, { a, b })['score'], '');
});
