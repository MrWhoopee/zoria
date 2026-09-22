import test from 'node:test';
import assert from 'node:assert/strict';
import { RateBudget } from '../../src/agent/budget.ts';

test('bucket yields exactly as many tokens as capacity', () => {
  const b = new RateBudget({ capacity: 20, refillMs: 3000 });
  for (let i = 0; i < 20; i += 1) assert.equal(b.tryTake(0), true, `request ${i + 1}`);
  assert.equal(b.tryTake(0), false, 'twenty-first request does not pass');
});

test('refill adds one token per 3 seconds', () => {
  const b = new RateBudget({ capacity: 20, refillMs: 3000 });
  for (let i = 0; i < 20; i += 1) b.tryTake(0);
  assert.equal(b.tryTake(2999), false);
  assert.equal(b.tryTake(3000), true);
  assert.equal(b.tryTake(3000), false);
});

test('bucket does not exceed capacity', () => {
  const b = new RateBudget({ capacity: 20, refillMs: 3000 });
  b.tryTake(0);
  let taken = 0;
  for (let i = 0; i < 50; i += 1) if (b.tryTake(10_000_000)) taken += 1;
  assert.equal(taken, 20);
});

test('time until next token', () => {
  const b = new RateBudget({ capacity: 20, refillMs: 3000 });
  for (let i = 0; i < 20; i += 1) b.tryTake(0);
  assert.equal(b.msUntilToken(0), 3000);
  assert.equal(b.msUntilToken(1000), 2000);
});

test('silence closes bucket regardless of tokens', () => {
  const b = new RateBudget({ capacity: 20, refillMs: 3000 });
  b.silence(30_000);
  assert.equal(b.tryTake(0), false, 'no requests during silence');
  assert.equal(b.tryTake(29_999), false);
  assert.equal(b.tryTake(30_000), true);
});

test('longer silence is never shortened by shorter one', () => {
  const b = new RateBudget({ capacity: 20, refillMs: 3000 });
  b.silence(120_000);
  b.silence(30_000);
  assert.equal(b.silentUntil(), 120_000);
});
