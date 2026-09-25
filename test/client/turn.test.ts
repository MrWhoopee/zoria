import test from 'node:test';
import assert from 'node:assert/strict';
import { autoTurn, drag, frameAt, grab, IDLE, peek, release, type Turn } from '../../src/client/notebook/turn.ts';
import { origin, target } from '../../src/client/notebook/curl.ts';

const F = { w: 400, h: 560 };

test('a grabbed corner follows the pointer back and forth until released', () => {
  let t: Turn = grab('next', F, { x: 780, y: 10 });
  t = drag(t, F, { x: 300, y: 50 });
  assert.deepEqual(frameAt(t, 0).pointer, { x: 300, y: 50 });
  t = drag(t, F, { x: 700, y: 40 });
  assert.deepEqual(frameAt(t, 0).pointer, { x: 700, y: 40 });
});

test('released closer to the far side, the page turns', () => {
  const t = release(drag(grab('next', F, { x: 780, y: 10 }), F, { x: 250, y: 60 }), F, 1000);
  assert.equal(t.phase, 'settle');
  if (t.phase === 'settle') {
    assert.equal(t.complete, true);
    assert.deepEqual(t.to, target('next', F));
  }
});

test('released closer to where it started, the page falls back', () => {
  const t = release(drag(grab('next', F, { x: 780, y: 10 }), F, { x: 650, y: 60 }), F, 1000);
  assert.equal(t.phase, 'settle');
  if (t.phase === 'settle') {
    assert.equal(t.complete, false);
    assert.deepEqual(t.to, origin('next', F));
  }
});

test('settling moves from the release point to its end and then reports done', () => {
  const t = release(drag(grab('next', F, { x: 780, y: 10 }), F, { x: 250, y: 60 }), F, 1000);
  if (t.phase !== 'settle') throw new Error('expected settle');
  const start = frameAt(t, 1000);
  assert.deepEqual(start.pointer, { x: 250, y: 60 });
  assert.equal(start.done, false);
  const end = frameAt(t, 1000 + t.ms);
  assert.deepEqual(end.pointer, target('next', F));
  assert.equal(end.done, true);
  assert.equal(end.completed, true);
  const xs = [0.25, 0.5, 0.75].map((k) => frameAt(t, 1000 + t.ms * k).pointer.x);
  assert.ok(xs[0] > xs[1] && xs[1] > xs[2], 'moves steadily toward the far side');
});

test('a key press turns the page along an arc, dipping below the top edge', () => {
  const t = autoTurn('prev', F, 0);
  assert.equal(t.phase, 'settle');
  if (t.phase !== 'settle') return;
  assert.equal(t.complete, true);
  assert.ok(frameAt(t, t.ms / 2).pointer.y > 0);
  assert.deepEqual(frameAt(t, t.ms).pointer, target('prev', F));
});

test('a peek lifts the corner a little; idle shows nothing', () => {
  const p = frameAt(peek('next', F), 0).pointer;
  const o = origin('next', F);
  assert.ok(p.x < o.x && p.y > o.y);
  assert.equal(IDLE.phase, 'idle');
});
