import test from 'node:test';
import assert from 'node:assert/strict';
import { Loop, SPEEDS, TICK_MS } from '../../src/arena/loop.ts';
import type { FromWorker } from '../../src/arena/protocol.ts';

function fakeSession(ticks: number) {
  let t = 0;
  const commands: unknown[] = [];
  return {
    commands,
    map: { slot: 'A', cells: [], seats: { A: { q: 0, r: 0 }, B: { q: 0, r: 0 }, C: { q: 0, r: 0 } }, ring: [] },
    step: () => (t >= ticks ? null : ({ t: ++t, done: t >= ticks } as never)),
    command: (c: unknown) => commands.push(c),
    done: () => t >= ticks,
    reveal: () => (t >= ticks ? ({ own: {}, units: [] } as never) : null),
    record: () => ({ v: 1, t } as never),
  };
}

function harness(ticks = 3) {
  const posts: FromWorker[] = [];
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  const sessions: ReturnType<typeof fakeSession>[] = [];
  const loop = new Loop(
    (m) => posts.push(m),
    (fn, ms) => {
      const h = { fn, ms, live: true };
      timers.push(h);
      return h;
    },
    (h) => {
      (h as { live: boolean }).live = false;
    },
    () => {
      const s = fakeSession(ticks);
      sessions.push(s);
      return s as never;
    },
  );
  const fire = () => {
    const h = timers.filter((x) => x.live).at(-1);
    if (h) {
      h.live = false;
      h.fn();
    }
  };
  return { loop, posts, timers, sessions, fire };
}

const start = { kind: 'start', seed: 1, slot: 'A', rivals: ['глушій', 'рівний'], preset: 'глушій' } as const;

test('start posts the map and waits paused', () => {
  const h = harness();
  h.loop.handle(start);
  assert.deepEqual(h.posts.map((p) => p.kind), ['map']);
  assert.equal(h.timers.length, 0);
});

test('resume ticks at the speed interval until the match ends', () => {
  const h = harness(3);
  h.loop.handle(start);
  h.loop.handle({ kind: 'speed', x: 2 });
  h.loop.handle({ kind: 'resume' });
  assert.equal(h.timers.at(-1)?.ms, TICK_MS / 2);
  h.fire();
  h.fire();
  h.fire();
  h.fire();
  assert.equal(h.posts.filter((p) => p.kind === 'frame').length, 3);
  assert.equal(h.timers.filter((x) => x.live).length, 0);
});

test('pause stops ticks and step advances exactly one', () => {
  const h = harness(5);
  h.loop.handle(start);
  h.loop.handle({ kind: 'resume' });
  h.loop.handle({ kind: 'pause' });
  assert.equal(h.timers.filter((x) => x.live).length, 0);
  h.loop.handle({ kind: 'step' });
  h.loop.handle({ kind: 'step' });
  assert.equal(h.posts.filter((p) => p.kind === 'frame').length, 2);
});

test('a new start silences the old game', () => {
  const h = harness(5);
  h.loop.handle(start);
  h.loop.handle({ kind: 'resume' });
  const old = h.timers.at(-1);
  h.loop.handle(start);
  old?.fn();
  assert.ok(h.posts.filter((p) => p.kind === 'frame').every((p) => p.kind === 'frame' && p.game === 2));
});

test('commands reach the session, reveal only after the end, speeds are fixed', () => {
  const h = harness(1);
  h.loop.handle(start);
  h.loop.handle({ kind: 'command', c: { kind: 'take', unit: 'K-A1' } });
  assert.equal(h.sessions[0]?.commands.length, 1);
  h.loop.handle({ kind: 'reveal' });
  assert.equal(h.posts.filter((p) => p.kind === 'reveal').length, 0);
  h.loop.handle({ kind: 'step' });
  h.loop.handle({ kind: 'reveal' });
  assert.equal(h.posts.filter((p) => p.kind === 'reveal').length, 1);
  assert.deepEqual(SPEEDS, [0.25, 0.5, 1, 2, 4, 8]);
});

test('an error inside a tick stops the loop and is reported', () => {
  const posts: FromWorker[] = [];
  const timers: { fn: () => void; live: boolean }[] = [];
  const broken = { map: { slot: 'A', cells: [], seats: {}, ring: [], starts: [] }, step: () => { throw new Error('boom'); }, command: () => undefined, done: () => false, reveal: () => null };
  const loop = new Loop((m) => posts.push(m), (fn) => { const h = { fn, live: true }; timers.push(h); return h; }, (h) => { (h as { live: boolean }).live = false; }, () => broken as never);
  loop.handle(start);
  loop.handle({ kind: 'resume' });
  const fired = timers.at(-1);
  if (fired) {
    fired.live = false;
    fired.fn();
  }
  assert.deepEqual(posts.filter((p) => p.kind === 'error').map((p) => p.kind === 'error' && p.message), ['boom']);
  assert.equal(timers.filter((x) => x.live).length, 0);
  loop.handle({ kind: 'step' });
  assert.equal(posts.filter((p) => p.kind === 'error').length, 2);
});

test('a record is posted once when the match ends and for an unfinished match on a new start', () => {
  const h = harness(2);
  h.loop.handle(start);
  h.loop.handle({ kind: 'step' });
  h.loop.handle(start);
  h.loop.handle({ kind: 'step' });
  h.loop.handle({ kind: 'step' });
  h.loop.handle({ kind: 'step' });
  const recs = h.posts.filter((p) => p.kind === 'record');
  assert.deepEqual(recs.map((p) => p.kind === 'record' && (p.record as unknown as { t: number }).t), [1, 2]);
  const fresh = harness(2);
  fresh.loop.handle(start);
  fresh.loop.handle(start);
  assert.equal(fresh.posts.filter((p) => p.kind === 'record').length, 0);
});
