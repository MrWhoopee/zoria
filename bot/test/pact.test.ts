import test from 'node:test';
import assert from 'node:assert/strict';
import type { Observe } from '@zoria/protocol';
import { pact } from '../src/plans/pact.ts';
import { presetOf } from '../src/preset.ts';
import { ctxOf } from './ctx.ts';
import { makeObs } from './obs.ts';

const on = presetOf('основний+pact=1');

function obsOf(score: [number, number, number], over: { in?: ('A' | 'B' | 'C')[]; out?: ('A' | 'B' | 'C')[]; active?: ['A' | 'B' | 'C', 'A' | 'B' | 'C'][]; breaking?: boolean; left?: number } = {}): Observe {
  const base = makeObs();
  return makeObs({
    t: 400,
    mine: { ...base.mine, pact: { in: (over.in ?? []).map((who) => ({ who, left: 10 })), out: (over.out ?? []).map((who) => ({ who, left: 10 })), offersLeft: over.left ?? 2, cryAt: null } },
    pub: {
      ...base.pub,
      score,
      pact: { active: (over.active ?? []).map(([a, b]) => ({ a, b, since: 300 })), breaks: over.breaking ? [{ a: 'B', b: 'C', at: 399 }] : [] },
    },
  });
}

const orders = (obs: Observe, preset = on) => pact(ctxOf('B', obs, 2026, preset)).map((t) => t.order);

test('pacts are off unless the preset turns them on', () => {
  assert.deepEqual(orders(obsOf([100, 50, 40]), presetOf('основний')), []);
});

test('behind the leader by enough, we offer a pact to the other trailing player', () => {
  assert.deepEqual(orders(obsOf([100, 50, 40])), [{ kind: 'pact', op: 'offer', to: 'C' }]);
});

test('no offer when the gap is small, when we lead, when an offer is out, or none are left', () => {
  assert.deepEqual(orders(obsOf([100, 90, 40])), []);
  assert.deepEqual(orders(obsOf([8, 0, 0])), []);
  assert.deepEqual(orders(obsOf([50, 100, 40])), []);
  assert.deepEqual(orders(obsOf([100, 50, 40], { out: ['C'] })), []);
  assert.deepEqual(orders(obsOf([100, 50, 40], { left: 0 })), []);
});

test('an offer from the other trailing player is accepted, never one from the leader', () => {
  assert.deepEqual(orders(obsOf([100, 50, 40], { in: ['C'] })), [{ kind: 'pact', op: 'accept', to: 'C' }]);
  assert.deepEqual(orders(obsOf([100, 50, 40], { in: ['A'] })), [{ kind: 'pact', op: 'offer', to: 'C' }]);
});

test('the pact is broken once we or the partner lead, and only once', () => {
  assert.deepEqual(orders(obsOf([40, 100, 50], { active: [['B', 'C']] })), [{ kind: 'pact', op: 'break', to: 'C' }]);
  assert.deepEqual(orders(obsOf([40, 50, 100], { active: [['C', 'B']] })), [{ kind: 'pact', op: 'break', to: 'C' }]);
  assert.deepEqual(orders(obsOf([100, 50, 40], { active: [['B', 'C']] })), []);
  assert.deepEqual(orders(obsOf([40, 100, 50], { active: [['B', 'C']], breaking: true })), []);
});

test('a partner is neither jammed nor taken from', async () => {
  const { jam } = await import('../src/plans/jam.ts');
  const base = makeObs();
  const own = [{ q: 5, r: -12, owner: 'A' as const, dark: false }, { q: 7, r: -13, owner: 'A' as const, dark: false }, { q: 5, r: -8, owner: 'A' as const, dark: false }];
  const k = { id: 'K-B7', cls: 'клинок' as const, q: 5, r: -7, mute: false, stuck: false, wait: 0, work: 0, away: 0, task: null };
  const obs = (active: ['A' | 'B' | 'C', 'A' | 'B' | 'C'][]): Observe =>
    makeObs({ t: 300, pulse: { ...base.pulse, chan: 400, chanAt: 400 }, mine: { ...base.mine, units: [k] }, own, pub: { ...base.pub, pact: { active: active.map(([a, b]) => ({ a, b, since: 1 })), breaks: [] } } });
  const preset = presetOf('основний+jam=1+jamHome=0');
  assert.equal(jam(ctxOf('B', obs([]), 2026, preset)).length, 1);
  assert.deepEqual(jam(ctxOf('B', obs([['A', 'B']]), 2026, preset)), []);
});
