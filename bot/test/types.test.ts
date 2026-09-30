import test from 'node:test';
import assert from 'node:assert/strict';
import { midStep, weightOf } from '../src/plans/types.ts';
import { valleyOf } from './fixture.ts';
import { tkach } from './obs.ts';

const route = (path: number) => ({ goal: null, site: null, feed: null, jam: null, ram: null, home: false, path });

test('swarm weight counts Tkachs as two and Klinoks as one', () => {
  assert.equal(weightOf(valleyOf('A'), [tkach('T1', 0, 0), { ...tkach('K1', 0, 0), cls: 'клинок' }, { ...tkach('K2', 0, 0), cls: 'клинок' }]), 4);
});

test('mid-step needs leftover wait and a route that is not empty', () => {
  assert.equal(midStep(tkach('T', 0, 0, { wait: 1, task: route(1) })), true);
  assert.equal(midStep(tkach('T', 0, 0, { wait: 0, task: route(3) })), false);
  assert.equal(midStep(tkach('T', 0, 0, { wait: 2, task: route(0) })), false);
  assert.equal(midStep(tkach('T', 0, 0, { wait: 2 })), false);
});
