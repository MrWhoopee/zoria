import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeOrders } from '@zoria/protocol';
import { createStrategy } from '../src/strategy.ts';
import { manifestBytes } from './fixture.ts';

test('garbage observe bytes give an empty orders frame', () => {
  const s = createStrategy();
  s.init(manifestBytes(), 'A');
  const out = s.tick(new Uint8Array([1, 2, 3]));
  assert.deepEqual(decodeOrders(out), []);
  assert.equal(s.belief(null)?.t, 0);
});

test('init rejects a broken manifest', () => {
  assert.throws(() => createStrategy().init(new Uint8Array([0]), 'A'));
});

test('brain stats are exposed after init', () => {
  const s = createStrategy();
  assert.equal(s.stats(), null);
  s.init(manifestBytes(), 'A');
  assert.deepEqual(s.stats(), { errors: 0, lastError: '', skipped: 0 });
});

test('verdicts before the manifest are ignored', async () => {
  const { encodeVerdicts } = await import('@zoria/protocol');
  const s = createStrategy();
  s.feedback?.(encodeVerdicts([[0, true, 0]]));
  assert.equal(s.stats(), null);
});
