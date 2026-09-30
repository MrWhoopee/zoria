import test from 'node:test';
import assert from 'node:assert/strict';
import { backoffMs, retryable, withJitter } from '../src/jitter.ts';

test('backoff is full jitter under a doubling cap that never passes the ceiling', () => {
  const top = (): number => 0.999999;
  assert.equal(backoffMs(0, 3000, top), 999);
  assert.equal(backoffMs(1, 3000, top), 1999);
  assert.equal(backoffMs(2, 3000, top), 2999);
  assert.equal(backoffMs(5, 3000, top), 2999);
  assert.equal(backoffMs(3, 3000, () => 0), 0);
  assert.equal(backoffMs(0, 3000, () => 0.5), 500);
  assert.equal(backoffMs(0, 1, top), 0);
  assert.equal(backoffMs(1, 2, top), 1);
  assert.equal(backoffMs(0, 2, top), 0);
});

test('only transport failures before the oath are retried', () => {
  assert.equal(retryable(new Error('wire did not come up in 5000 ms')), true);
  assert.equal(retryable(new Error('wire closed before the oath, code 1006')), true);
  assert.equal(retryable(new Error('wire closed before the oath, code 3999')), true);
  assert.equal(retryable(new Error('wire closed before the oath, code 4000')), false);
  assert.equal(retryable(new Error('wire closed before the oath, code 4001')), false);
  assert.equal(retryable(new Error('pins disagree')), false);
  assert.equal(retryable('wire did not come up'), true);
});

test('withJitter retries retryable errors up to the limit and reports each wait', async () => {
  const waits: number[] = [];
  const seen: number[] = [];
  let calls = 0;
  const fail = new Error('wire did not come up');
  const out = await withJitter({ tries: 3, ceilMs: 300, rnd: () => 0.5, sleep: async (ms) => { waits.push(ms); }, onRetry: (n) => seen.push(n) }, async () => {
    calls++;
    if (calls < 3) throw fail;
    return 'ok';
  });
  assert.equal(out, 'ok');
  assert.equal(calls, 3);
  assert.deepEqual(seen, [1, 2]);
  assert.deepEqual(waits, [50, 100]);
});

test('withJitter gives up at the try limit and never retries a node verdict', async () => {
  let calls = 0;
  await assert.rejects(withJitter({ tries: 2, ceilMs: 10, sleep: async () => undefined }, async () => {
    calls++;
    throw new Error('wire did not come up');
  }));
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(withJitter({ tries: 5, ceilMs: 10, sleep: async () => undefined }, async () => {
    calls++;
    throw new Error('wire closed before the oath, code 4003');
  }));
  assert.equal(calls, 1);
});
