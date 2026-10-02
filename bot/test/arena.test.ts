import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../arena/session.ts';
import { rivalNames, rivalSeat } from '../arena/roster.ts';
import type { ArenaFrame } from '../arena/frame.ts';

test('rivals are presets, schedules and archetypes, never nakaz', () => {
  const names = rivalNames();
  for (const n of ['глушій', 'загарбник', 'рівний']) assert.ok(names.includes(n), n);
  assert.ok(!names.includes('черепаха'));
  assert.equal(typeof rivalSeat('глушій').bot, 'object');
  assert.equal(typeof rivalSeat('рівний').style, 'object');
  assert.throws(() => rivalSeat('черепаха'), /unknown rival/);
});

test('a session steps to the end and frames show only what the slot sees', () => {
  const s = new Session({ seed: 100, slot: 'B', rivals: ['глушій', 'рівний'], preset: 'глушій' });
  assert.equal(s.map.slot, 'B');
  assert.ok(s.map.cells.length > 1000);
  let last: ArenaFrame | null = null;
  let frames = 0;
  for (let f = s.step(); f; f = s.step()) {
    last = f;
    frames++;
    for (const [, p] of f.foe) assert.notEqual(p, 'B');
    if (frames === 200) assert.equal(s.reveal(), null);
  }
  assert.ok(last?.done);
  assert.equal(frames, 1200);
  assert.ok(s.done());
  assert.ok(s.reveal());
  assert.equal(s.step(), null);
});

test('a general command reaches the brain on the next tick', () => {
  const s = new Session({ seed: 100, slot: 'A', rivals: ['рівний', 'рівний'], preset: 'глушій' });
  let f = s.step();
  for (let i = 0; i < 40 && f && f.units.length === 0; i++) f = s.step();
  const u = f?.units[0];
  assert.ok(u);
  s.command({ kind: 'take', unit: u.id });
  s.command({ kind: 'order', order: { kind: 'halt', unit: u.id } });
  const next = s.step();
  assert.ok(next?.units.find((x) => x.id === u.id)?.manual);
  assert.ok(next?.decisions.some((d) => d.tag === 'general:order'));
});

test('the map lists the start needles and a moving unit reads as moving', async () => {
  const { taskOf } = await import('../arena/frame.ts');
  const s = new Session({ seed: 100, slot: 'A', rivals: ['рівний', 'рівний'], preset: 'глушій' });
  assert.equal(s.map.starts.length, 6);
  const base = { goal: null, site: null, feed: null, jam: null, ram: null, home: false, path: 0 };
  assert.equal(taskOf({ task: { ...base, path: 3 } }), 'move');
  assert.equal(taskOf({ task: { ...base, path: 0 } }), 'work');
  assert.equal(taskOf({ task: null }), 'idle');
});
