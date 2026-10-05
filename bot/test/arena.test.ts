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
  assert.equal(taskOf({ task: { ...base, goal: { q: 1, r: 1 }, path: 0 } }), 'idle');
  assert.equal(taskOf({ task: null }), 'idle');
});

test('a session records the commands with their ticks and the result, and a replay reproduces it', async () => {
  const { replay } = await import('../arena/replay.ts');
  const s = new Session({ seed: 100, slot: 'A', rivals: ['глушій', 'рівний'], preset: 'глушій' });
  let f = s.step();
  for (let i = 0; i < 60 && f; i++) f = s.step();
  const u = f?.units[0];
  assert.ok(u);
  s.command({ kind: 'take', unit: u.id });
  s.command({ kind: 'order', order: { kind: 'halt', unit: u.id } });
  let last = f;
  for (f = s.step(); f; f = s.step()) last = f;
  const rec = s.record();
  assert.deepEqual([rec.v, rec.seed, rec.slot, rec.rivals, rec.preset], [1, 100, 'A', ['глушій', 'рівний'], 'глушій']);
  assert.deepEqual(rec.commands.map((x) => [x.t, x.c.kind]), [[61, 'take'], [61, 'order']]);
  assert.deepEqual(rec.end, { t: 1200, done: true, score: last?.score, place: last?.place });
  const again = replay(rec, true);
  assert.deepEqual(again.final.score, last?.score);
  const alone = replay(rec, false);
  const plain = new Session({ seed: 100, slot: 'A', rivals: ['глушій', 'рівний'], preset: 'глушій' });
  let p = plain.step();
  let lastPlain = p;
  for (; p; p = plain.step()) lastPlain = p;
  assert.deepEqual(alone.final.score, lastPlain?.score);
  assert.equal(again.scores.length, 1200);
});

test('records save under a safe name inside the arena folder only', async () => {
  const { mkdtempSync, readdirSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { saveRecord } = await import('../arena/save.ts');
  const dir = mkdtempSync(join(tmpdir(), 'arena-'));
  const rec = { v: 1, at: '2026-10-02T12:00:00.000Z', seed: 10, slot: 'A', rivals: ['глушій', '../x>y'], preset: 'глушій', commands: [], end: null };
  const name = saveRecord(dir, JSON.stringify(rec));
  assert.equal(name, '2026-10-02T12-00-00-s10-A-глушій-.._x_y.json');
  assert.deepEqual(readdirSync(dir), [name]);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, name), 'utf8')), rec);
  assert.throws(() => saveRecord(dir, '{"v":2}'), /bad arena record/);
  assert.throws(() => saveRecord(dir, 'not json'), /bad arena record/);
});

test('frames carry how long each unit has been out of link range and whether it froze', () => {
  const s = new Session({ seed: 100, slot: 'A', rivals: ['рівний', 'рівний'], preset: 'глушій' });
  let f = s.step();
  for (let i = 0; i < 60 && f && f.units.length === 0; i++) f = s.step();
  const u = f?.units[0];
  assert.ok(u);
  assert.equal(typeof u.away, 'number');
  assert.equal(typeof u.stuck, 'boolean');
});
