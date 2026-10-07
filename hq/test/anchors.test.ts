import test from 'node:test';
import assert from 'node:assert/strict';
import { ANCHORS, ORGANS, fmtCell, fmtScore, fmtShares, parseCell } from '../src/anchors.ts';

test('anchors and organs are exactly the contract tables 3.3 and 4.2', () => {
  assert.deepEqual(ANCHORS, ['tick', 'match', 'mode', 'focus', 'cell', 'cell-owner-truth', 'cell-owner-belief', 'ghost-cell', 'ghost-age', 'diff-count', 'dark-count', 'score', 'needles', 'shares', 'bytes', 'orders', 'denied', 'deny-word', 'deny-top-tick', 'ab-winner', 'ab-diff', 'ab-top', 'promote-status', 'live-lag', 'live-state']);
  assert.deepEqual(ORGANS, ['go-tick', 'go-match', 'go-mode', 'go-focus', 'go-cell', 'go-unit', 'go-order', 'go-pack', 'go-preset', 'do-promote']);
});

test('values are formatted as the contract shows them', () => {
  assert.equal(fmtScore(119.55447), '119.6');
  assert.equal(fmtScore(-0.04), '0.0');
  assert.equal(fmtScore(12), '12.0');
  assert.equal(fmtCell({ q: 3, r: -10 }), '3,-10');
  assert.equal(fmtShares([3, 2, 1]), '3,2,1');
});

test('a typed cell is parsed leniently and rejected when malformed', () => {
  assert.deepEqual(parseCell(' 3, -10 '), { q: 3, r: -10 });
  assert.deepEqual(parseCell('-4,12'), { q: -4, r: 12 });
  assert.equal(parseCell('3'), null);
  assert.equal(parseCell('a,b'), null);
  assert.equal(parseCell('1.5,2'), null);
});
