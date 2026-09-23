import test from 'node:test';
import assert from 'node:assert/strict';
import { initialEther, reduceEther, serverNow, msUntilOpen } from '../../src/protocol/ether.ts';
import type { Observation } from '../../src/protocol/classify.ts';
import type { Frame } from '../../src/protocol/types.ts';

const T0 = Date.parse('2026-09-24T03:00:00.000Z');

function frame(over: Partial<Frame> = {}): Frame {
  return {
    v: 1, kind: 'signal', station: 'zoria', at: new Date(T0).toISOString(),
    phase: 'static', window: null, harbinger: null, fragment: null, onAir: 0,
    ...over,
  };
}

function signal(f: Frame, receivedAt: number): Observation {
  return { t: 'signal', frame: f, frameAt: Date.parse(f.at), receivedAt };
}

test('harbinger gives the opening moment in server time', () => {
  const f = frame({ harbinger: { opensIn: 21600, text: { uk: 'a', ru: 'b' } } });
  const s = reduceEther(initialEther(), signal(f, 500));
  assert.equal(s.phase, 'static');
  assert.equal(s.opensAt, T0 + 21600 * 1000);
});

test('clock correction — frame time minus local receive time', () => {
  const s = reduceEther(initialEther(), signal(frame(), 500));
  assert.equal(s.skewMs, T0 - 500);
  assert.equal(serverNow(s, 1500), T0 + 1000);
});

test('countdown to opening is measured in server time', () => {
  const f = frame({ harbinger: { opensIn: 600, text: { uk: 'a', ru: 'b' } } });
  const s = reduceEther(initialEther(), signal(f, 0));
  assert.equal(msUntilOpen(s, 0), 600_000);
  assert.equal(msUntilOpen(s, 60_000), 540_000);
});

test('echo does not roll the phase back (CL-05)', () => {
  const opened = frame({
    at: new Date(T0 + 10_000).toISOString(),
    phase: 'window',
    window: { opensAt: new Date(T0).toISOString(), closesAt: new Date(T0 + 36_000_000).toISOString() },
  });
  let s = reduceEther(initialEther(), signal(opened, 100));
  assert.equal(s.phase, 'window');

  const stale = frame({ at: new Date(T0).toISOString(), phase: 'static' });
  s = reduceEther(s, signal(stale, 200));
  assert.equal(s.phase, 'window', 'a stale frame does not roll the phase back to static');
  assert.equal(s.ribbon.at(-1), 'signal');
});

test('window gives both edges of the span', () => {
  const f = frame({
    phase: 'window',
    window: { opensAt: new Date(T0).toISOString(), closesAt: new Date(T0 + 36_000_000).toISOString() },
  });
  const s = reduceEther(initialEther(), signal(f, 0));
  assert.equal(s.opensAt, T0);
  assert.equal(s.closesAt, T0 + 36_000_000);
});

test('extending the window pushes closesAt forward', () => {
  const at1 = new Date(T0).toISOString();
  const first = frame({
    phase: 'window',
    window: { opensAt: at1, closesAt: new Date(T0 + 36_000_000).toISOString() },
  });
  let s = reduceEther(initialEther(), signal(first, 0));
  const later = frame({
    at: new Date(T0 + 1000).toISOString(),
    phase: 'window',
    window: { opensAt: at1, closesAt: new Date(T0 + 40_000_000).toISOString() },
  });
  s = reduceEther(s, signal(later, 1000));
  assert.equal(s.closesAt, T0 + 40_000_000);
});

test('letter fragments are collected by number, a repeat is discarded', () => {
  let s = initialEther();
  s = reduceEther(s, signal(frame({ fragment: { n: 3, of: 12, text: 'third' } }), 0));
  s = reduceEther(s, signal(frame({
    at: new Date(T0 + 1000).toISOString(),
    fragment: { n: 3, of: 12, text: 'REPLACEMENT' },
  }), 1000));
  s = reduceEther(s, signal(frame({
    at: new Date(T0 + 2000).toISOString(),
    fragment: { n: 5, of: 12, text: 'fifth' },
  }), 2000));
  assert.equal(s.fragments[3], 'third');
  assert.equal(s.fragments[5], 'fifth');
  assert.equal(s.fragmentsOf, 12);
});

test('jamming sets the silence deadline', () => {
  const s = reduceEther(initialEther(), { t: 'jammed', retryAfterMs: 30_000, receivedAt: 1000 });
  assert.equal(s.silentUntil, 31_000);
  assert.equal(s.ribbon.at(-1), 'jam');
});

test('node silence also sets a pause, but is not jamming', () => {
  const s = reduceEther(initialEther(), { t: 'stopping', retryAfterMs: 30_000, receivedAt: 1000 });
  assert.equal(s.silentUntil, 31_000);
  assert.equal(s.ribbon.at(-1), 'silence');
});

test('forgery leaves its own mark in the ribbon', () => {
  const s = reduceEther(initialEther(), { t: 'noise', why: 'bad-seal', status: 200, receivedAt: 0 });
  assert.equal(s.ribbon.at(-1), 'forgery');
  assert.equal(s.phase, null, 'forgery does not change the phase');
});

test('the ribbon does not grow without bound', () => {
  let s = initialEther();
  for (let i = 0; i < 500; i += 1) {
    s = reduceEther(s, { t: 'noise', why: 'not-json', status: 500, receivedAt: i });
  }
  assert.equal(s.ribbon.length, 240);
});

test('a longer silence is never shortened by a shorter one', () => {
  let s = reduceEther(initialEther(), { t: 'jammed', retryAfterMs: 120_000, receivedAt: 1000 });
  assert.equal(s.silentUntil, 121_000);

  s = reduceEther(s, { t: 'stopping', retryAfterMs: 1000, receivedAt: 5000 });
  assert.equal(s.silentUntil, 121_000, 'a shorter pause does not shorten a longer one');
});

test('silence — a transport error without a pause', () => {
  const s = reduceEther(initialEther(), { t: 'silence', reason: 'timeout', receivedAt: 1000 });
  assert.equal(s.ribbon.at(-1), 'silence');
  assert.equal(s.phase, null, 'an error does not change the phase');
  assert.equal(s.silentUntil, 0, 'an error does not set a silence deadline');
});

test('a repeated frame with an equal frameAt does not update the state', () => {
  const opened = frame({
    at: new Date(T0 + 10_000).toISOString(),
    phase: 'window',
    window: { opensAt: new Date(T0).toISOString(), closesAt: new Date(T0 + 36_000_000).toISOString() },
  });
  let s = reduceEther(initialEther(), signal(opened, 100));
  assert.equal(s.phase, 'window');
  assert.equal(s.skewMs, T0 + 10_000 - 100);

  const repeated = frame({
    at: new Date(T0 + 10_000).toISOString(),
    phase: 'static',
    window: null,
  });
  s = reduceEther(s, signal(repeated, 500));
  assert.equal(s.phase, 'window', 'an equal frameAt does not update the phase');
  assert.equal(s.skewMs, T0 + 10_000 - 100, 'an equal frameAt does not update skewMs');
  assert.equal(s.opensAt, T0, 'an equal frameAt does not update opensAt');
  assert.equal(s.closesAt, T0 + 36_000_000, 'an equal frameAt does not update closesAt');
});

test('msUntilOpen returns null without opensAt', () => {
  const s = initialEther();
  assert.equal(msUntilOpen(s, 1000), null);
});

test('a fragment of a letter with a different size starts a new letter and keeps the old one', () => {
  let s = initialEther();
  s = reduceEther(s, signal(frame({ fragment: { n: 1, of: 12, text: 'old first' } }), 0));
  s = reduceEther(s, signal(frame({
    at: new Date(T0 + 1000).toISOString(),
    fragment: { n: 2, of: 20, text: 'new second' },
  }), 1000));
  assert.deepEqual(s.fragments, { 2: 'new second' });
  assert.equal(s.fragmentsOf, 20);
  assert.deepEqual(s.archive, [{ of: 12, fragments: { 1: 'old first' } }]);
});

test('a frame without a fragment keeps the letter as it is', () => {
  let s = initialEther();
  s = reduceEther(s, signal(frame({ fragment: { n: 1, of: 12, text: 'first' } }), 0));
  s = reduceEther(s, signal(frame({ at: new Date(T0 + 1000).toISOString() }), 1000));
  assert.deepEqual(s.fragments, { 1: 'first' });
  assert.equal(s.fragmentsOf, 12);
  assert.deepEqual(s.archive, []);
});
