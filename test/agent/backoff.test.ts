import test from 'node:test';
import assert from 'node:assert/strict';
import { backoffMs } from '../../src/agent/backoff.ts';

test('first retry is between 0 and 1 second', () => {
  assert.equal(backoffMs(0, () => 0), 0);
  assert.equal(backoffMs(0, () => 1), 1000);
  assert.equal(backoffMs(0, () => 0.5), 500);
});

test('window doubles with each retry', () => {
  assert.equal(backoffMs(1, () => 1), 2000);
  assert.equal(backoffMs(2, () => 1), 4000);
  assert.equal(backoffMs(3, () => 1), 8000);
});

test('ceiling is 60 seconds', () => {
  assert.equal(backoffMs(10, () => 1), 60_000);
  assert.equal(backoffMs(99, () => 1), 60_000);
});

test('full jitter: lower bound is always zero', () => {
  for (const attempt of [0, 3, 7, 20]) {
    assert.equal(backoffMs(attempt, () => 0), 0);
  }
});
