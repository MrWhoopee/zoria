import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEngine } from '@zoria/engine';
import { openJournal } from '@zoria/sdk';
import { Truth, diffCount, manifestNeedles, ownerTruth } from '../src/model/truth.ts';

const bytes = (n: number): Uint8Array => new Uint8Array(readFileSync(new URL('../../records/reference/match-' + n + '.runlog', import.meta.url)));

test('truth at a tick equals a fresh cursor stepped there, forwards and backwards', () => {
  const t = new Truth(bytes(2));
  for (const tick of [33, 959, 330, 1200, 30]) {
    const got = t.at(tick);
    const fresh = openJournal(createEngine, bytes(2));
    fresh.seek(tick);
    const E = fresh.engine as unknown as { SIM: { world: { own: Record<string, string | null>; needles: Record<string, number> } }; simScore(p: string): number };
    assert.equal(got.t, tick);
    assert.deepEqual(got.owners, { ...E.SIM.world.own });
    for (const s of ['A', 'B', 'C']) {
      assert.equal(got.score[s], E.simScore(s));
      assert.equal(got.needles[s], E.SIM.world.needles[s] ?? 0);
    }
  }
});

test('the truth owner reads as a nick, K for the Keeper, - for no needle or nobody', () => {
  const roster = ['nazar_k', 'ihor_ts', 'oksana_fe'];
  assert.equal(ownerTruth({ '1,1': 'B', '2,2': 'K', '3,3': null }, '1,1', roster), 'ihor_ts');
  assert.equal(ownerTruth({ '1,1': 'B', '2,2': 'K', '3,3': null }, '2,2', roster), 'K');
  assert.equal(ownerTruth({ '1,1': 'B', '2,2': 'K', '3,3': null }, '3,3', roster), '-');
  assert.equal(ownerTruth({ '1,1': 'B' }, '9,9', roster), '-');
});

test('diff counts manifest needles the belief knows and gets wrong', () => {
  const needles = ['1,1', '2,2', '3,3', '4,4'];
  const truth = { '1,1': 'A', '2,2': 'B', '3,3': null };
  const belief = new Map<string, string | null>([['1,1', 'A'], ['2,2', 'C'], ['3,3', 'B'], ['9,9', 'A']]);
  assert.equal(diffCount(truth, belief, needles), 2);
  assert.equal(diffCount(truth, new Map([['4,4', null]]), needles), 0);
});

test('manifest needles come from the journal manifest', () => {
  const n = manifestNeedles(bytes(1));
  assert.ok(n.length > 20);
  assert.ok(n.includes('5,-12'));
  assert.equal(new Set(n).size, n.length);
});
