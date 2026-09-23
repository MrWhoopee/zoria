import test from 'node:test';
import assert from 'node:assert/strict';
import { initialEther } from '../../src/protocol/ether.ts';
import { rememberEther, restoreEther, sameMemory } from '../../src/agent/memory.ts';

const OPENS = Date.parse('2026-09-24T05:00:00.000Z');
const CLOSES = Date.parse('2026-09-24T15:00:00.000Z');

test('the letter, its archive and the window survive a round trip through the state file', () => {
  const ether = {
    ...initialEther(),
    phase: 'static' as const, opensAt: OPENS, closesAt: CLOSES,
    fragments: { 3: 'third', 8: 'eighth' }, fragmentsOf: 32,
    archive: [{ of: 12, fragments: { 1: 'old' } }],
  };
  const memory = JSON.parse(JSON.stringify(rememberEther(ether)));
  const back = restoreEther(memory);
  assert.equal(back.opensAt, OPENS);
  assert.equal(back.closesAt, CLOSES);
  assert.deepEqual(back.fragments, { 3: 'third', 8: 'eighth' });
  assert.equal(back.fragmentsOf, 32);
  assert.deepEqual(back.archive, [{ of: 12, fragments: { 1: 'old' } }]);
});

test('what is not worth keeping starts fresh after a restart', () => {
  const back = restoreEther(rememberEther({ ...initialEther(), phase: 'window', lastFrameAt: OPENS, ribbon: ['signal'] }));
  assert.equal(back.phase, null);
  assert.equal(back.lastFrameAt, null);
  assert.deepEqual(back.ribbon, []);
});

test('an old state file without the new fields restores to an empty letter', () => {
  const back = restoreEther({ opensAt: null, closesAt: null, fragments: {} } as never);
  assert.equal(back.fragmentsOf, null);
  assert.deepEqual(back.archive, []);
});

test('memory counts as changed only when something kept has changed', () => {
  const a = rememberEther({ ...initialEther(), fragments: { 1: 'a' }, fragmentsOf: 32 });
  assert.equal(sameMemory(a, rememberEther({ ...initialEther(), fragments: { 1: 'a' }, fragmentsOf: 32, ribbon: ['noise'] })), true);
  assert.equal(sameMemory(a, rememberEther({ ...initialEther(), fragments: { 1: 'a', 2: 'b' }, fragmentsOf: 32 })), false);
});
