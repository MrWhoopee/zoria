import test from 'node:test';
import assert from 'node:assert/strict';
import { keepalive } from '../src/plans/keepalive.ts';
import { ctxOf } from './ctx.ts';
import { makeObs, tkach } from './obs.ts';

test('the gap is counted from the last accepted command', () => {
  const ctx = ctxOf('B', makeObs({ t: 10 }));
  ctx.memo.lastAccepted = 8;
  assert.equal(keepalive(ctx), null);
  ctx.memo.lastAccepted = 6;
  assert.ok(keepalive(ctx));
});

test('a free halt needs exactly one command of channel left, and costs nothing', () => {
  const ctx = ctxOf('B', makeObs({ t: 10, pulse: { ...makeObs().pulse, chan: 32 }, mine: { ...makeObs().mine, units: [tkach('T-B6', 6, 6)] } }));
  const t = keepalive(ctx);
  assert.deepEqual(t?.order, { kind: 'halt', unit: 'T-B6' });
  assert.deepEqual([t?.value, t?.bytes, t?.energy], [0, 0, 0]);
  const poor = ctxOf('B', makeObs({ t: 10, pulse: { ...makeObs().pulse, chan: 31 }, mine: { ...makeObs().mine, units: [tkach('T-B6', 6, 6)] } }));
  const w = keepalive(poor);
  assert.equal(w?.order.kind, 'watch');
  assert.deepEqual([w?.value, w?.energy], [0, 0]);
});
