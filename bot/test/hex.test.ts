import test from 'node:test';
import assert from 'node:assert/strict';
import { disc, dist, key, keyOf, neighbors, parse } from '../src/hex.ts';

test('dist is the axial hex distance', () => {
  assert.equal(dist({ q: 0, r: 0 }, { q: 6, r: -12 }), 12);
  assert.equal(dist({ q: 6, r: 6 }, { q: -12, r: 6 }), 18);
  assert.equal(dist({ q: 2, r: -1 }, { q: 2, r: -1 }), 0);
});

test('key and parse round-trip', () => {
  assert.equal(key(-13, 7), '-13,7');
  assert.deepEqual(parse('-13,7'), { q: -13, r: 7 });
  assert.equal(keyOf({ q: 5, r: -12 }), '5,-12');
});

test('neighbors are six cells at distance one', () => {
  const n = neighbors({ q: 3, r: -2 });
  assert.equal(n.length, 6);
  for (const c of n) assert.equal(dist(c, { q: 3, r: -2 }), 1);
  assert.equal(new Set(n.map(keyOf)).size, 6);
});

test('disc sizes follow 1 + 3r(r+1)', () => {
  assert.equal(disc({ q: 0, r: 0 }, 0).length, 1);
  assert.equal(disc({ q: 4, r: 1 }, 3).length, 37);
  assert.equal(disc({ q: 0, r: 0 }, 19).length, 1141);
  for (const c of disc({ q: 4, r: 1 }, 3)) assert.ok(dist(c, { q: 4, r: 1 }) <= 3);
});
