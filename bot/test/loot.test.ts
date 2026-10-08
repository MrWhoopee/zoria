import test from 'node:test';
import assert from 'node:assert/strict';
import type { MineUnit } from '@zoria/protocol';
import { loot } from '../src/plans/loot.ts';
import { presetOf } from '../src/preset.ts';
import { ctxOf } from './ctx.ts';
import { makeObs, tkach } from './obs.ts';

const klinok = (id: string, q: number, r: number, over: Partial<MineUnit> = {}): MineUnit => ({ ...tkach(id, q, r), cls: 'клинок', ...over });
const on = presetOf('глушій-3+cache=60');

test('an idle Klinok in reach walks to a cache that is still on the field', () => {
  const obs = makeObs({ t: 20, mine: { ...makeObs().mine, units: [klinok('K-B1', 2, 10)] } });
  assert.deepEqual(loot(ctxOf('B', obs, 2026, on))[0]?.order, { kind: 'move', unit: 'K-B1', q: 0, r: 12, goal: null, home: false });
  assert.equal(loot(ctxOf('B', obs, 2026, presetOf('глушій-3'))).length, 0);
});

test('no cache run when the cache is taken, too far, or the Klinok is busy', () => {
  const units = [klinok('K-B1', 2, 10)];
  const taken = makeObs({ t: 20, mine: { ...makeObs().mine, units }, events: [{ type: 'find', p: 'A', q: 0, r: 12, find: 'cache' }] });
  assert.equal(loot(ctxOf('B', taken, 2026, on)).length, 0);
  const far = makeObs({ t: 20, mine: { ...makeObs().mine, units } });
  assert.equal(loot(ctxOf('B', far, 2026, presetOf('глушій-3+cache=1'))).length, 0);
  const busy = makeObs({ t: 20, mine: { ...makeObs().mine, units: [klinok('K-B1', 2, 10, { task: { goal: null, site: null, feed: null, jam: null, ram: null, home: false, path: 3 } })] } });
  assert.equal(loot(ctxOf('B', busy, 2026, on)).length, 0);
});

test('a cache already run for is not sent twice', () => {
  const units = [klinok('K-B1', 2, 10), klinok('K-B2', 3, 10)];
  const ctx = ctxOf('B', makeObs({ t: 20, mine: { ...makeObs().mine, units } }), 2026, on);
  const first = loot(ctx);
  assert.equal(first.length, 1);
  first[0]?.commit(ctx.memo, 20);
  ctx.w.update(makeObs({ t: 21, mine: { ...makeObs().mine, units: [klinok('K-B1', 2, 10, { task: { goal: null, site: null, feed: null, jam: null, ram: null, home: false, path: 2 } }), units[1]!] } }));
  assert.equal(loot(ctx).length, 0);
});
