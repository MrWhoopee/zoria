import test from 'node:test';
import assert from 'node:assert/strict';
import { keyOf, dist } from '../src/hex.ts';
import { cfg, inside, price, typeAt } from '../src/map/valley.ts';
import { valleyOf } from './fixture.ts';

test('valley has 1141 cells, 51 ruins and 12 ring needles', () => {
  const v = valleyOf('B');
  assert.equal(v.cells.length, 1141);
  assert.equal(v.level.size, 1141);
  assert.equal(v.ruins.length, 51);
  assert.equal(v.ring.length, 12);
  assert.equal(v.starts.length, 6);
});

test('our base is the seat next to our start needles', () => {
  assert.deepEqual(valleyOf('A').base, { q: 6, r: -12 });
  assert.deepEqual(valleyOf('B').base, { q: 6, r: 6 });
  assert.deepEqual(valleyOf('C').base, { q: -12, r: 6 });
  const v = valleyOf('B');
  for (const s of v.starts.filter((x) => x.slot === 'B')) assert.equal(dist(s.cell, v.base), 1);
});

test('cfg reads world numbers and throws on unknown keys', () => {
  const v = valleyOf('A');
  assert.equal(cfg(v, 'linkRange'), 5);
  assert.equal(cfg(v, 'costTkach'), 90);
  assert.throws(() => cfg(v, 'noSuchKey'));
});

test('terrain lookup, price and inside', () => {
  const v = valleyOf('A');
  assert.equal(typeAt(v, { q: 0, r: 0 })?.name, 'bare');
  assert.equal(price(v, { q: 0, r: 0 }), 2);
  assert.equal(inside(v, { q: 0, r: 19 }), true);
  assert.equal(inside(v, { q: 0, r: 20 }), false);
  assert.equal(price(v, { q: 0, r: 20 }), 0);
  const listed = v.cells.find((c) => v.terrain.get(keyOf(c)) === 6);
  if (listed) assert.equal(price(v, listed), 0);
});

test('dead-cell finds are collected', () => {
  const v = valleyOf('A');
  assert.equal(v.dead.has('0,9'), true);
});
