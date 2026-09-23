import test from 'node:test';
import assert from 'node:assert/strict';
import { HUM_PARTIALS, crackleParams, dipGain } from '../../src/client/audio/voices.ts';

test('the hum is 50 Hz mains with falling harmonics', () => {
  assert.equal(HUM_PARTIALS[0].hz, 50);
  for (let i = 1; i < HUM_PARTIALS.length; i += 1) {
    assert.equal(HUM_PARTIALS[i].hz, 50 * (i + 1));
    assert.ok(HUM_PARTIALS[i].gain < HUM_PARTIALS[i - 1].gain);
  }
});

test('the hum sags with the flicker and never goes silent or negative', () => {
  assert.equal(dipGain(0), 1);
  assert.ok(Math.abs(dipGain(1) - 0.2) < 1e-9);
  assert.equal(dipGain(-1), 1);
  assert.ok(Math.abs(dipGain(5) - 0.2) < 1e-9);
});

test('a deeper flicker crackles louder', () => {
  const soft = crackleParams({ lamp: 'left', depth: 0.1, durationMs: 80 }, () => 0);
  const hard = crackleParams({ lamp: 'left', depth: 0.9, durationMs: 80 }, () => 0);
  assert.ok(hard.peak > soft.peak);
  assert.ok(soft.peak > 0);
});

test('the crackle decay is bounded however long the flicker', () => {
  assert.equal(crackleParams({ lamp: 'l', depth: 0.5, durationMs: 5 }, () => 0).decayMs, 20);
  assert.equal(crackleParams({ lamp: 'l', depth: 0.5, durationMs: 900 }, () => 0).decayMs, 120);
});

test('the crackle colour varies within a fixed band', () => {
  assert.equal(crackleParams({ lamp: 'l', depth: 0.5, durationMs: 80 }, () => 0).cutoffHz, 1800);
  assert.equal(crackleParams({ lamp: 'l', depth: 0.5, durationMs: 80 }, () => 1).cutoffHz, 4400);
});
