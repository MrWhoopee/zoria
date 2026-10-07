import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Channel } from '../src/model/channel.ts';
import { compare } from '../src/model/compare.ts';
import type { PackSummary } from '../src/model/names.ts';

const rec = (dir: string, name: string): URL => new URL('../../records/' + dir + '/' + name, import.meta.url);
const runlog = (n: number): Uint8Array => new Uint8Array(readFileSync(rec('reference', 'match-' + n + '.runlog')));
const pack = (dir: string): PackSummary => JSON.parse(readFileSync(rec(dir, 'pack.json'), 'utf8')) as PackSummary;

test('channel figures on tick 502 of match 1 match the driver keys of seed 1', () => {
  const c = new Channel(runlog(1), 'A');
  assert.deepEqual(c.at(502), { bytes: 6, orders: 1, denied: 0 });
  assert.equal(c.denyWord(502, 0), '-');
  assert.equal(c.worstTick(), 976);
});

test('a tick without a frame has zero bytes and orders, and words exist for denied commands', () => {
  const c = new Channel(runlog(1), 'A');
  assert.deepEqual(c.at(0), { bytes: 0, orders: 0, denied: 0 });
  const t = c.worstTick();
  const a = c.at(t);
  assert.ok(a.denied > 0);
  const words = Array.from({ length: a.orders }, (_, i) => c.denyWord(t, i)).filter((w) => w !== '-');
  assert.equal(words.length, a.denied);
  assert.equal(c.denyWord(t, 999), '-');
});

test('preset comparison matches the driver keys of seed 1', () => {
  const r = compare(pack('preset-a'), pack('preset-b'));
  assert.equal(r.winner, 'preset-a');
  assert.equal(r.diff(2), '12.6');
  assert.equal(r.top(2), 'network');
});
