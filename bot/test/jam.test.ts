import test from 'node:test';
import assert from 'node:assert/strict';
import type { MineUnit, Observe } from '@zoria/protocol';
import { keyOf } from '../src/hex.ts';
import { jam, jamGain, tailOf, JAM_BAN, LOOT_GRACE } from '../src/plans/jam.ts';
import { pullOf } from '../src/map/coverage.ts';
import { presetOf } from '../src/preset.ts';
import { ctxOf } from './ctx.ts';
import { makeObs, tkach } from './obs.ts';

const on = presetOf('основний+jam=1+jamHome=0');
const starts = [{ q: 7, r: 5, dark: false, fed: false, weight: 1 }, { q: 5, r: 7, dark: false, fed: false, weight: 1 }];
const chain = [
  { q: 5, r: -12, owner: 'A' as const, dark: false },
  { q: 7, r: -13, owner: 'A' as const, dark: false },
  { q: 5, r: -8, owner: 'A' as const, dark: false },
  { q: 5, r: -4, owner: 'A' as const, dark: false },
];

function klinok(id: string, q: number, r: number, over: Partial<MineUnit> = {}): MineUnit {
  return { ...tkach(id, q, r), cls: 'клинок', ...over };
}

function obsWith(units: MineUnit[], over: Partial<Observe> = {}): Observe {
  const base = makeObs();
  return makeObs({ t: 300, pulse: { ...base.pulse, chan: 400, chanAt: 400 }, mine: { ...base.mine, needles: starts, units }, own: chain, ...over });
}

test('a needle that carries the rest of a foe chain has that chain as its tail', () => {
  const ctx = ctxOf('B', obsWith([]));
  assert.deepEqual(tailOf(ctx, 'A', { q: 5, r: -8 }).map(keyOf), ['5,-4']);
  assert.deepEqual(tailOf(ctx, 'A', { q: 5, r: -4 }), []);
});

test('jamming a node is worth more than jamming a leaf, and more still against the leader', () => {
  const ctx = ctxOf('B', obsWith([]));
  const own = pullOf(ctx.v, ctx.w.ownLit().map((c) => ({ cell: c, mult: 1 })));
  const foe = pullOf(ctx.v, ctx.w.foeLit());
  const node = jamGain(ctx, { q: 5, r: -8 }, tailOf(ctx, 'A', { q: 5, r: -8 }), own, foe, 1);
  const leaf = jamGain(ctx, { q: 5, r: -8 }, [], own, foe, 1);
  assert.ok(node > leaf && leaf > 0);
  assert.ok(jamGain(ctx, { q: 5, r: -8 }, [], own, foe, 2) > leaf);
});

test('jamming is off unless the preset turns it on', () => {
  assert.deepEqual(jam(ctxOf('B', obsWith([klinok('K-B7', 5, -2)]))), []);
});

test('a free Klinok walks next to a foe needle, never to a start needle or the Keeper ring', () => {
  const tasks = jam(ctxOf('B', obsWith([klinok('K-B7', 5, -2)]), 2026, on));
  const o = tasks[0]?.order;
  assert.equal(o?.kind, 'move');
  if (o?.kind === 'move') {
    const d = Math.max(Math.abs(o.q - 5), Math.abs(o.r + 4), Math.abs(o.q + o.r - 1));
    assert.ok(d <= 1 || Math.max(Math.abs(o.q - 5), Math.abs(o.r + 8), Math.abs(o.q + o.r + 3)) <= 1);
  }
});

test('a Klinok already next to the needle jams it and holds', () => {
  const ctx = ctxOf('B', obsWith([klinok('K-B7', 5, -7)]), 2026, on);
  const o = jam(ctx)[0]?.order;
  assert.equal(o?.kind, 'jam');
  if (o?.kind === 'jam') assert.equal(o.hold, true);
});

test('no new jam when the channel cannot pay for it', () => {
  const base = makeObs();
  const poor = obsWith([klinok('K-B7', 5, -2)], { pulse: { ...base.pulse, chan: 90, chanAt: 90 } });
  assert.deepEqual(jam(ctxOf('B', poor, 2026, on)), []);
});

test('the home guard keeps a Klinok out of jamming', () => {
  assert.deepEqual(jam(ctxOf('B', obsWith([klinok('K-B7', 5, -2)]), 2026, presetOf('основний+jam=1+jamHome=1'))), []);
});

test('a jam that steals nothing is dropped and the needle banned for a while', () => {
  const ctx = ctxOf('B', obsWith([klinok('K-B7', 5, -7)]), 2026, on);
  const first = jam(ctx)[0];
  assert.ok(first);
  first.commit(ctx.memo, 300);
  const held = { goal: null, site: null, feed: null, jam: { q: 5, r: -8 }, ram: null, home: false, path: 0 };
  const u = klinok('K-B7', 5, -7, { task: held });
  ctx.w.update(obsWith([u], { t: 301 }));
  assert.deepEqual(jam(ctx), []);
  ctx.w.update(obsWith([u], { t: 302 + LOOT_GRACE }));
  assert.equal(jam(ctx)[0]?.order.kind, 'halt');
  assert.equal(ctx.memo.res.has('K-B7'), false);
  assert.equal(ctx.memo.banned.get('jam:5,-8'), 302 + LOOT_GRACE + JAM_BAN);
});

test('a jam that keeps stealing is kept', () => {
  const ctx = ctxOf('B', obsWith([klinok('K-B7', 5, -7)]), 2026, on);
  jam(ctx)[0]?.commit(ctx.memo, 300);
  const held = { goal: null, site: null, feed: null, jam: { q: 5, r: -8 }, ram: null, home: false, path: 0 };
  const u = klinok('K-B7', 5, -7, { task: held });
  const base = makeObs();
  ctx.w.update(obsWith([u], { t: 301 }));
  jam(ctx);
  ctx.w.update(obsWith([u], { t: 302 + LOOT_GRACE, mine: { ...base.mine, needles: starts, units: [u], ledger: { pactTax: 0, stolen: 3 } } }));
  assert.deepEqual(jam(ctx), []);
  assert.equal(ctx.memo.res.get('K-B7')?.kind, 'jam');
});
