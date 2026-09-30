import test from 'node:test';
import assert from 'node:assert/strict';
import { keyOf } from '../src/hex.ts';
import { World } from '../src/world.ts';
import { valleyOf } from './fixture.ts';
import { makeObs } from './obs.ts';

test('initial memory knows ruins, ring and start needles', () => {
  const v = valleyOf('B');
  const w = new World(v);
  const ruin = v.ruins[0];
  const ring = v.ring[0];
  assert.ok(ruin && ring);
  assert.equal(w.owner.get(keyOf(ruin)), null);
  assert.equal(w.owner.get(keyOf(ring)), 'K');
  assert.equal(w.owner.get('7,5'), 'B');
  assert.equal(w.owner.get('5,-12'), 'A');
});

test('update copies pulse, units and our needles', () => {
  const w = new World(valleyOf('B'));
  w.update(makeObs({
    t: 7,
    pulse: { energy: 44, chan: 141, chanAt: 141, ear: 900, earAt: 1386, minutes: 1.5, needles: 2, mercy: false },
    mine: { ...makeObs().mine, needles: [{ q: 7, r: 5, dark: false, fed: false, weight: 1 }, { q: 5, r: 7, dark: true, fed: false, weight: 0 }] },
  }));
  assert.equal(w.t, 7);
  assert.equal(w.energy, 44);
  assert.deepEqual(w.ownLit(), [{ q: 7, r: 5 }]);
  assert.equal(w.dark.get('5,7'), true);
});

test('visible needles and capture events update owners', () => {
  const v = valleyOf('B');
  const w = new World(v);
  const [r0, r1] = v.ruins;
  assert.ok(r0 && r1);
  w.update(makeObs({
    t: 50,
    own: [{ q: r0.q, r: r0.r, owner: 'A', dark: false }],
    events: [{ type: 'cap', p: 'C', q: r1.q, r: r1.r, from: null, ring: false }],
  }));
  assert.equal(w.owner.get(keyOf(r0)), 'A');
  assert.equal(w.seen.get(keyOf(r0)), 50);
  assert.equal(w.owner.get(keyOf(r1)), 'C');
  assert.deepEqual(w.foeLit().map((s) => keyOf(s.cell)).includes(keyOf(r0)), true);
});

test('a needle we no longer hold takes the owner from losts, else becomes unknown-free', () => {
  const v = valleyOf('B');
  const w = new World(v);
  const [r0, r1] = v.ruins;
  assert.ok(r0 && r1);
  w.update(makeObs({ t: 10, mine: { ...makeObs().mine, needles: [{ q: r0.q, r: r0.r, dark: false, fed: false, weight: 1 }, { q: r1.q, r: r1.r, dark: false, fed: false, weight: 1 }] } }));
  assert.equal(w.owner.get(keyOf(r0)), 'B');
  w.update(makeObs({ t: 11, mine: { ...makeObs().mine, losts: [{ q: r0.q, r: r0.r, t: 11, owner: 'A', dark: false }] } }));
  assert.equal(w.owner.get(keyOf(r0)), 'A');
  assert.equal(w.owner.get(keyOf(r1)), null);
});

test('keeper ring pulls with the ring multiplier', () => {
  const v = valleyOf('A');
  const w = new World(v);
  const ringSources = w.foeLit().filter((s) => v.ringKeys.has(keyOf(s.cell)));
  assert.equal(ringSources.length, 12);
  assert.equal(ringSources[0]?.mult, v.cfg['ringPull']);
});

test('update keeps the open contract and our hold progress', () => {
  const w = new World(valleyOf('B'));
  const board = { cells: [{ q: 1, r: 9 }, { q: 2, r: 9 }, { q: 3, r: 8 }] as [{ q: number; r: number }, { q: number; r: number }, { q: number; r: number }], from: 40, to: 130, bonus: 30, holdTicks: 12 };
  w.update(makeObs({ t: 50, pub: { ...makeObs().pub, order: board }, mine: { ...makeObs().mine, order: { ticks: 3, reason: null, cell: null } } }));
  assert.deepEqual(w.order, board);
  assert.equal(w.hold?.ticks, 3);
  w.update(makeObs({ t: 51 }));
  assert.equal(w.order, null);
  assert.equal(w.hold, null);
});

test('a fresh world has an empty pulse', () => {
  const w = new World(valleyOf('A'));
  assert.deepEqual([w.t, w.energy, w.chan, w.chanAt, w.ear, w.minutes], [0, 0, 0, 0, 0, 0]);
  assert.deepEqual([w.units, w.mine, w.foe, w.order, w.hold], [[], [], [], null, null]);
});

test('foeLit skips ruins, our own and dark needles and weighs ring needles', () => {
  const v = valleyOf('B');
  const w = new World(v);
  const [r0, r1, r2] = v.ruins;
  assert.ok(r0 && r1 && r2);
  w.update(makeObs({ t: 5, own: [{ q: r0.q, r: r0.r, owner: 'A', dark: false }, { q: r1.q, r: r1.r, owner: 'C', dark: true }], mine: { ...makeObs().mine, needles: [{ q: r2.q, r: r2.r, dark: false, fed: false, weight: 1 }] } }));
  const lit = w.foeLit();
  const keys = lit.map((s) => keyOf(s.cell));
  assert.ok(keys.includes(keyOf(r0)));
  assert.ok(!keys.includes(keyOf(r1)));
  assert.ok(!keys.includes(keyOf(r2)));
  assert.ok(!v.ruins.slice(3).some((r) => keys.includes(keyOf(r))));
  assert.equal(lit.find((s) => keyOf(s.cell) === keyOf(r0))?.mult, 1);
  assert.equal(lit.find((s) => keyOf(s.cell) === '7,5'), undefined);
  assert.ok(lit.some((s) => keyOf(s.cell) === '5,-12' && s.mult === 1));
});

test('a ring needle pulls with the ring multiplier whoever holds it', () => {
  const v = valleyOf('B');
  const w = new World(v);
  const ring = v.ring[0];
  assert.ok(ring);
  w.update(makeObs({ t: 5, own: [{ q: ring.q, r: ring.r, owner: 'A', dark: false }] }));
  assert.equal(w.foeLit().find((s) => keyOf(s.cell) === keyOf(ring))?.mult, v.cfg['ringPull']);
});

test('world remembers when each of our needles became ours', () => {
  const v = valleyOf('B');
  const w = new World(v);
  const [r0] = v.ruins;
  assert.ok(r0);
  w.update(makeObs({ t: 10, mine: { ...makeObs().mine, needles: [{ q: 7, r: 5, dark: false, fed: false, weight: 1 }] } }));
  assert.equal(w.since.get('7,5'), -Infinity);
  w.update(makeObs({ t: 20, mine: { ...makeObs().mine, needles: [{ q: 7, r: 5, dark: false, fed: false, weight: 1 }, { q: r0.q, r: r0.r, dark: false, fed: false, weight: 1 }] } }));
  assert.equal(w.since.get(keyOf(r0)), 20);
  w.update(makeObs({ t: 30, mine: { ...makeObs().mine, needles: [{ q: 7, r: 5, dark: false, fed: false, weight: 1 }, { q: r0.q, r: r0.r, dark: false, fed: false, weight: 1 }] } }));
  assert.equal(w.since.get(keyOf(r0)), 20);
  w.update(makeObs({ t: 40, mine: { ...makeObs().mine, needles: [{ q: 7, r: 5, dark: false, fed: false, weight: 1 }] } }));
  assert.equal(w.since.has(keyOf(r0)), false);
});

test('world remembers where each foe stood on the previous tick', () => {
  const w = new World(valleyOf('B'));
  w.update(makeObs({ t: 10, foe: [{ id: 'T-A3', p: 'A', cls: 'ткач', q: 9, r: 3 }] }));
  assert.equal(w.stillFoe('T-A3'), false);
  w.update(makeObs({ t: 11, foe: [{ id: 'T-A3', p: 'A', cls: 'ткач', q: 9, r: 3 }] }));
  assert.equal(w.stillFoe('T-A3'), true);
  w.update(makeObs({ t: 12, foe: [{ id: 'T-A3', p: 'A', cls: 'ткач', q: 9, r: 4 }] }));
  assert.equal(w.stillFoe('T-A3'), false);
});

test('world counts how long a foe has stood still', () => {
  const w = new World(valleyOf('B'));
  const at = (t: number, q: number) => makeObs({ t, foe: [{ id: 'T-A3', p: 'A', cls: 'ткач', q, r: 3 }] });
  w.update(at(10, 9));
  assert.equal(w.stillFor('T-A3'), 0);
  w.update(at(11, 9));
  w.update(at(12, 9));
  assert.equal(w.stillFor('T-A3'), 2);
  w.update(at(13, 8));
  assert.equal(w.stillFor('T-A3'), 0);
  assert.equal(w.stillFor('nobody'), 0);
});
