import test from 'node:test';
import assert from 'node:assert/strict';
import { air, bell, buzz, cassette, click, hum, knob, motor, press, spool, thump } from '../src/sound/render.ts';

const SR = 48000;

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const peak = (x: Float32Array): number => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

test('every voice is finite, short and as loud as asked', () => {
  const rnd = seeded(7);
  const voices: [string, Float32Array, number, number][] = [
    ['click', click(SR, rnd, 2000, 4000, 0.03, 0.1), 0.1, 0.03],
    ['bell', bell(SR), 0.16, 1.3],
    ['buzz', buzz(SR), 0.07, 0.52],
    ['thump', thump(SR, rnd), 0.42, 0.3],
    ['spool up', spool(SR, rnd, true), 0.05, 0.22],
    ['spool down', spool(SR, rnd, false), 0.05, 0.22],
    ['cassette', cassette(SR, rnd), 0.32, 0.14],
    ['knob', knob(SR, rnd), 0.17, 0.07],
    ['press', press(SR, rnd), 0.22, 0.07],
  ];
  for (const [name, x, want, sec] of voices) {
    assert.ok(x.every(Number.isFinite), name + ' is finite');
    assert.ok(Math.abs(peak(x) - want) < 1e-6, name + ' peak ' + peak(x));
    assert.ok(Math.abs(x.length / SR - sec) < 0.01, name + ' length ' + x.length / SR);
  }
});

test('one-shot voices fade out to silence', () => {
  const rnd = seeded(3);
  for (const x of [bell(SR), thump(SR, rnd), knob(SR, rnd), click(SR, rnd, 2000, 4000, 0.03, 0.1)]) {
    const tail = x.subarray(x.length - 32);
    assert.ok(peak(tail) < peak(x) * 0.02);
  }
});

test('loops are quiet and join without a click', () => {
  const rnd = seeded(11);
  for (const [x, loud] of [[hum(SR, rnd), 0.03], [motor(SR), 0.025], [air(SR, rnd), 0.02]] as const) {
    assert.ok(Math.abs(peak(x) - loud) < 1e-6);
    const jump = Math.abs((x[0] ?? 0) - (x[x.length - 1] ?? 0));
    assert.ok(jump < loud * 0.25, 'seam ' + jump);
  }
});
