import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrderBoard } from '@zoria/protocol';
import { contractExtra } from '../src/plans/contract.ts';
import { presetOf } from '../src/preset.ts';
import { ctxOf } from './ctx.ts';
import { makeObs } from './obs.ts';

const starts = [{ q: 7, r: 5, dark: false, fed: false, weight: 1 }, { q: 5, r: 7, dark: false, fed: false, weight: 1 }];

function board(cells: [number, number][], to = 200): OrderBoard {
  const [a, b, c] = cells.map(([q, r]) => ({ q, r }));
  if (!a || !b || !c) throw new Error('three cells');
  return { cells: [a, b, c], from: 100, to, bonus: 30, holdTicks: 12 };
}

test('a contract cell is worth the bonus split over the cells still needed', () => {
  const order = board([[7, 5], [9, 2], [10, 1]]);
  const ctx = ctxOf('B', makeObs({ t: 120, pub: { ...makeObs().pub, order }, mine: { ...makeObs().mine, needles: starts } }));
  assert.equal(contractExtra(ctx, { q: 9, r: 2 }, 20), 15);
  assert.equal(contractExtra(ctx, { q: 8, r: 2 }, 20), 0);
});

test('no bonus when the hold cannot finish before the deadline', () => {
  const order = board([[8, 2], [9, 2], [10, 1]], 150);
  const ctx = ctxOf('B', makeObs({ t: 120, pub: { ...makeObs().pub, order }, mine: { ...makeObs().mine, needles: starts } }));
  assert.equal(contractExtra(ctx, { q: 9, r: 2 }, 10), 10);
  assert.equal(contractExtra(ctx, { q: 9, r: 2 }, 19), 0);
});

test('no bonus without a contract and the weight knob scales it', () => {
  const plain = ctxOf('B', makeObs({ t: 120, mine: { ...makeObs().mine, needles: starts } }));
  assert.equal(contractExtra(plain, { q: 9, r: 2 }, 5), 0);
  const order = board([[8, 2], [9, 2], [10, 1]]);
  const half = ctxOf('B', makeObs({ t: 120, pub: { ...makeObs().pub, order }, mine: { ...makeObs().mine, needles: starts } }), 2026, presetOf('основний+contract=0.5'));
  assert.equal(contractExtra(half, { q: 9, r: 2 }, 5), 5);
});

test('an open contract pulls a free Tkach to its cells', async () => {
  const { expand } = await import('../src/plans/expand.ts');
  const { tkach } = await import('./obs.ts');
  const units = [tkach('T-B6', 6, 6)];
  const plain = ctxOf('B', makeObs({ t: 120, pulse: { ...makeObs().pulse, energy: 0 }, mine: { ...makeObs().mine, needles: starts, units } }));
  const first = expand(plain)[0]?.order;
  assert.ok(first && first.kind === 'move');
  const anchors = [plain.v.base, ...plain.w.ownLit()];
  const other = plain.v.ruins.filter((r) => plain.links.reach(r, anchors) && !(r.q === first.q && r.r === first.r));
  const [a, b, c] = other;
  assert.ok(a && b && c);
  const order: OrderBoard = { cells: [a, b, c], from: 100, to: 400, bonus: 30, holdTicks: 12 };
  const ctx = ctxOf('B', makeObs({ t: 120, pulse: { ...makeObs().pulse, energy: 0 }, pub: { ...makeObs().pub, order }, mine: { ...makeObs().mine, needles: starts, units } }));
  const o = expand(ctx)[0]?.order;
  assert.ok(o && o.kind === 'move');
  assert.ok(order.cells.some((x) => x.q === o.q && x.r === o.r));
});

test('a hold that ends exactly at the deadline still counts, one missing cell takes the whole bonus', () => {
  const order = board([[8, 2], [9, 2], [10, 1]], 150);
  const ctx = ctxOf('B', makeObs({ t: 120, pub: { ...makeObs().pub, order }, mine: { ...makeObs().mine, needles: starts } }));
  assert.equal(contractExtra(ctx, { q: 9, r: 2 }, 18), 10);
  const two = [...starts, { q: 8, r: 2, dark: false, fed: false, weight: 1 }, { q: 9, r: 2, dark: false, fed: false, weight: 1 }];
  const last = ctxOf('B', makeObs({ t: 120, pub: { ...makeObs().pub, order }, mine: { ...makeObs().mine, needles: two } }));
  assert.equal(contractExtra(last, { q: 10, r: 1 }, 5), 30);
});
