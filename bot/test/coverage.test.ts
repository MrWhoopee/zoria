import test from 'node:test';
import assert from 'node:assert/strict';
import { disc, dist, keyOf } from '../src/hex.ts';
import { gain, pullOf, share } from '../src/map/coverage.ts';
import { price } from '../src/map/valley.ts';
import { valleyOf } from './fixture.ts';

test('share splits proportionally only above one', () => {
  assert.equal(share(1, 0), 1);
  assert.equal(share(0.5, 0.5), 0.5);
  assert.equal(share(1, 1), 0.5);
  assert.ok(Math.abs(share(2 / 3, 1) - 0.4) < 1e-9);
  assert.equal(share(0, 1), 0);
});

test('pullOf uses ring weights by distance', () => {
  const v = valleyOf('A');
  const c = { q: 0, r: -10 };
  const p = pullOf(v, [{ cell: c, mult: 1 }]);
  assert.equal(p.get(keyOf(c)), 1);
  assert.equal(p.get(keyOf({ q: 1, r: -10 })), 1);
  assert.ok(Math.abs((p.get(keyOf({ q: 2, r: -10 })) ?? 0) - 2 / 3) < 1e-9);
  assert.ok(Math.abs((p.get(keyOf({ q: 3, r: -10 })) ?? 0) - 1 / 3) < 1e-9);
  assert.equal(p.get(keyOf({ q: 4, r: -10 })), undefined);
});

test('gain on empty ground is the price-weighted footprint', () => {
  const v = valleyOf('A');
  const site = { q: 0, r: -10 };
  let expect = 0;
  for (const c of disc(site, 3)) expect += price(v, c) * (v.rings[dist(c, site)] ?? 0);
  assert.ok(Math.abs(gain(v, site, new Map(), new Map()) - expect) < 1e-9);
});

test('gain is zero where we already pull one everywhere', () => {
  const v = valleyOf('A');
  const site = { q: 0, r: -10 };
  const full = new Map(disc(site, 3).map((c) => [keyOf(c), 1]));
  assert.equal(gain(v, site, full, new Map()), 0);
});

test('a second needle on the same cell adds much less than the first', () => {
  const v = valleyOf('A');
  const site = { q: 0, r: -10 };
  const own = pullOf(v, [{ cell: site, mult: 1 }]);
  assert.ok(gain(v, site, own, new Map()) < gain(v, site, new Map(), new Map()) / 2);
});

test('contested ground is worth less than free ground', () => {
  const v = valleyOf('A');
  const site = { q: 0, r: -10 };
  const foe = pullOf(v, [{ cell: { q: 1, r: -10 }, mult: 1 }]);
  assert.ok(gain(v, site, new Map(), foe) < gain(v, site, new Map(), new Map()));
});

test('taking a foe needle gains our share and removes theirs', async () => {
  const { takeGain } = await import('../src/map/coverage.ts');
  const v = valleyOf('A');
  const site = { q: 0, r: -10 };
  const foe = pullOf(v, [{ cell: site, mult: 1 }]);
  const free = gain(v, site, new Map(), new Map());
  assert.ok(Math.abs(takeGain(v, site, new Map(), foe, 1, 0) - free) < 1e-9);
  assert.ok(Math.abs(takeGain(v, site, new Map(), foe, 1, 1) - 2 * free) < 1e-9);
});

test('multipliers scale pull and gain, missing rings are an error', async () => {
  const { ringWeight, takeGain } = await import('../src/map/coverage.ts');
  const v = valleyOf('A');
  const site = { q: 0, r: -10 };
  const p2 = pullOf(v, [{ cell: site, mult: 2 }]);
  assert.equal(p2.get(keyOf(site)), 2);
  assert.ok(Math.abs((p2.get(keyOf({ q: 2, r: -10 })) ?? 0) - 4 / 3) < 1e-9);
  const free = gain(v, site, new Map(), new Map());
  let half = 0;
  for (const c of disc(site, 3)) half += price(v, c) * (v.rings[dist(c, site)] ?? 0) * 0.5;
  assert.ok(Math.abs(gain(v, site, new Map(), new Map(), 0.5) - half) < 1e-9);
  assert.ok(gain(v, site, new Map(), new Map(), 2) > free);
  assert.ok(Math.abs(takeGain(v, site, new Map(), new Map(), 1, 1) - free) < 1e-9);
  const foe = pullOf(v, [{ cell: site, mult: 1 }]);
  assert.ok(Math.abs(takeGain(v, site, new Map(), foe, 1, 0.5) - 1.5 * free) < 1e-9);
  let partial = 0;
  for (const c of disc(site, 3)) {
    const w = v.rings[dist(c, site)] ?? 0;
    const f2 = Math.max(0, w - w * 0.5);
    partial += price(v, c) * (share(w, f2) - share(0, w) + (share(w, 0) - share(f2, w)));
  }
  assert.ok(Math.abs(takeGain(v, site, new Map(), foe, 0.5, 1) - partial) < 1e-9);
  assert.equal(ringWeight(v, 3), v.rings[3]);
  assert.throws(() => ringWeight(v, 4), /^Error: no ring weight at 4$/);
});

test('share caps the sum at one', () => {
  assert.equal(share(0.5, 0), 0.5);
  assert.equal(share(0.3, 0.2), 0.3);
  assert.equal(share(3, 1), 0.75);
});

test('taking a needle where we already pull fully gains nothing for us', async () => {
  const { takeGain } = await import('../src/map/coverage.ts');
  const v = valleyOf('A');
  const site = { q: 0, r: -10 };
  const full = new Map(disc(site, 3).map((c) => [keyOf(c), 1]));
  assert.equal(takeGain(v, site, full, new Map(), 1, 0), 0);
});

test('feeding pays only where the outer rings are not ours yet', async () => {
  const { feedGain, pullOf } = await import('../src/map/coverage.ts');
  const { valleyOf } = await import('./fixture.ts');
  const v = valleyOf('B');
  const site = { q: 9, r: 3 };
  const none = new Map<string, number>();
  const alone = feedGain(v, site, pullOf(v, [{ cell: site, mult: 1 }]), none);
  assert.ok(alone > 0);
  const crowd = [site, { q: 12, r: 3 }, { q: 6, r: 3 }, { q: 9, r: 6 }, { q: 9, r: 0 }, { q: 12, r: 0 }, { q: 6, r: 6 }].map((cell) => ({ cell, mult: 1 }));
  assert.ok(feedGain(v, site, pullOf(v, crowd), none) < alone / 2);
});
