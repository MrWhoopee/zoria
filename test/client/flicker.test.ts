import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DARKNESS_OFF, DEFAULT_FLICKER, POWER_ON_DARKNESS, meterLevels, planFlickers,
} from '../../src/client/scene/flicker.ts';
import { stepDuration } from '../../src/client/scene/machine.ts';

function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

test('a lamp flickers only when the roll falls under the chance', () => {
  assert.deepEqual(planFlickers(['left'], seq([0.99])), []);
  assert.equal(planFlickers(['left'], seq([0.01, 0.5, 0.5])).length, 1);
});

test('depth and duration come from the configured ranges', () => {
  const o = { chance: 1, minDepth: 0.25, maxDepth: 0.75, minMs: 40, maxMs: 140 };
  const [low] = planFlickers(['left'], seq([0, 0, 0]), o);
  const [high] = planFlickers(['left'], seq([0, 1, 1]), o);
  assert.deepEqual(low, { lamp: 'left', depth: 0.25, durationMs: 40 });
  assert.deepEqual(high, { lamp: 'left', depth: 0.75, durationMs: 140 });
});

test('each lamp rolls independently and events name their lamp', () => {
  const events = planFlickers(['left', 'right'], seq([0.01, 0.5, 0.5, 0.99]));
  assert.deepEqual(events.map((e) => e.lamp), ['left']);
});

test('no lamps, no flickers', () => {
  assert.deepEqual(planFlickers([], Math.random), []);
});

test('the default flicker is rare and short', () => {
  assert.ok(DEFAULT_FLICKER.chance <= 0.1);
  assert.ok(DEFAULT_FLICKER.maxMs <= 200);
});

test('the power-on flicker ends fully lit and fits inside the lights-on step', () => {
  const [lastOpacity] = POWER_ON_DARKNESS[POWER_ON_DARKNESS.length - 1];
  assert.equal(lastOpacity, 0);
  const total = POWER_ON_DARKNESS.reduce((sum, [, ms]) => sum + ms, 0);
  assert.ok(total < (stepDuration('lightsOn', false) ?? 0), `pattern ${total}ms`);
  for (const [opacity] of POWER_ON_DARKNESS) assert.ok(opacity >= 0 && opacity <= DARKNESS_OFF);
});

test('meter levels stay visible and never exceed full', () => {
  for (const v of meterLevels(8, seq([0, 0.5, 1]))) assert.ok(v >= 0.35 && v <= 1);
  assert.equal(meterLevels(8, Math.random).length, 8);
});
