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

test('truth carries the scene of the tick: units, threads, jams, scans and the order', () => {
  const t = new Truth(bytes(1));
  const got = t.at(600);
  const fresh = openJournal(createEngine, bytes(1));
  fresh.seek(600);
  const E = fresh.engine as unknown as {
    SIM: { units: { id: string; p: string; cls: string; q: number; r: number; from: number; until: number }[]; world: { jam: Record<string, { until: number }>; scan: Record<string, { q: number; r: number; rad: number } | null> }; order: { cells: string[]; from: number; to: number } | null };
    linkTree(p: string, w: unknown): { aq: number; ar: number; bq: number; br: number }[];
  };
  const alive = E.SIM.units.filter((u) => u.from <= 600 && 600 < u.until).map((u) => [u.id, u.p, u.cls, u.q, u.r]);
  assert.ok(alive.length > 5);
  assert.deepEqual(got.units, alive);
  assert.deepEqual(got.links['B'], E.linkTree('B', E.SIM.world).flatMap((l) => [l.aq, l.ar, l.bq, l.br]));
  assert.deepEqual(got.jam, Object.keys(E.SIM.world.jam).filter((k) => (E.SIM.world.jam[k]?.until ?? 0) > 600));
  assert.equal(got.scans.length, Object.values(E.SIM.world.scan).filter(Boolean).length);
  assert.deepEqual(got.order, E.SIM.order && E.SIM.order.from <= 600 && 600 <= E.SIM.order.to ? E.SIM.order.cells : []);
});

test('the land of a match lists every non-bare cell once', () => {
  const land = new Truth(bytes(1)).land();
  assert.ok(land.length > 100);
  assert.equal(new Set(land.map(([k]) => k)).size, land.length);
  assert.ok(land.every(([, type]) => type !== 'bare'));
});
