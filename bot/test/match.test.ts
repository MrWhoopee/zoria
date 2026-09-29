import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '@zoria/engine';
import { runMatch } from '@zoria/sdk';
import { decodeOrders } from '@zoria/protocol';
import { createStrategy } from '../src/strategy.ts';

test('our bot never stays silent six ticks and grows its network', () => {
  const ticks = 300;
  const sent = new Map<number, number>();
  const denied = new Map<number, number>();
  const res = runMatch(createEngine, {
    seed: 2026,
    ticks,
    bots: { A: createStrategy() },
    tapOrders: (t, slot, bytes) => {
      if (slot === 'A') sent.set(t, decodeOrders(bytes)?.length ?? 0);
    },
    tapDenies: (t, slot, denies) => {
      if (slot === 'A') denied.set(t, denies.length);
    },
  });
  let run = 0;
  let worst = 0;
  for (let t = 1; t <= ticks; t++) {
    const n = sent.get(t) ?? 0;
    const silent = n === 0 || (denied.get(t) ?? 0) >= n;
    run = silent ? run + 1 : 0;
    worst = Math.max(worst, run);
  }
  assert.ok(worst < 6, 'longest silence ' + worst);
  assert.equal(res.garbage.A, 0);
  assert.ok(res.needles.A >= 8, 'needles ' + res.needles.A);
});
