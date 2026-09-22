import test from 'node:test';
import assert from 'node:assert/strict';
import { startNoiseServer } from './noise-server.ts';
import { EtherLoop } from '../../src/agent/ether-loop.ts';
import { makeStationKey, KeyRing } from '../../src/protocol/keyring.ts';
import { LEARNING_PUBLIC_KEY, LEARNING_FINGERPRINT } from '../fixtures/frames.ts';

async function loopOn(url: string, now: () => number): Promise<EtherLoop> {
  const ring = new KeyRing();
  ring.add(await makeStationKey(LEARNING_PUBLIC_KEY, LEARNING_FINGERPRINT));
  return new EtherLoop({
    api: url, ring, timeoutMs: 2000, intervalMs: 15_000,
    capacity: 20, refillMs: 3000, now,
    rand: () => 0,
  });
}

test('genuine frame updates phase and opening moment', async () => {
  const noise = await startNoiseServer([{ kind: 'signal' }]);
  try {
    const loop = await loopOn(noise.url, () => 0);
    await loop.tickOnce();
    const s = loop.state();
    assert.equal(s.phase, 'static');
    assert.equal(s.opensAt, Date.parse('2026-09-24T03:00:00.000Z') + 21_600_000);
  } finally {
    await noise.close();
  }
});

test('forgery with a false window does not open registration', async () => {
  const noise = await startNoiseServer([{ kind: 'forgery' }]);
  try {
    const loop = await loopOn(noise.url, () => 0);
    await loop.tickOnce();
    assert.equal(loop.state().phase, null, 'phase did not change');
    assert.equal(loop.state().ribbon.at(-1), 'forgery');
  } finally {
    await noise.close();
  }
});

test('jamming stops requests for the whole Retry-After', async () => {
  const noise = await startNoiseServer([{ kind: 'jammed', retryAfter: 30 }]);
  try {
    let clock = 0;
    const loop = await loopOn(noise.url, () => clock);
    await loop.tickOnce();
    assert.equal(noise.requestCount(), 1);

    clock = 29_000;
    await loop.tickOnce();
    assert.equal(noise.requestCount(), 1, 'no requests while jammed');

    clock = 30_001;
    await loop.tickOnce();
    assert.equal(noise.requestCount(), 2, 'request goes out once the deadline passes');
  } finally {
    await noise.close();
  }
});

test('503 stopping is a pause, not a failure: the backoff counter does not grow', async () => {
  const noise = await startNoiseServer([{ kind: 'stopping', retryAfter: 1 }]);
  try {
    let clock = 0;
    const loop = await loopOn(noise.url, () => clock);
    await loop.tickOnce();
    assert.equal(loop.failures(), 0, 'the node falling silent is not counted as a failure');
  } finally {
    await noise.close();
  }
});

test('a dropped connection counts as a failure and grows the backoff', async () => {
  const noise = await startNoiseServer([{ kind: 'hang' }]);
  try {
    const loop = await loopOn(noise.url, () => 0);
    await loop.tickOnce();
    await loop.tickOnce();
    assert.equal(loop.failures(), 2);
  } finally {
    await noise.close();
  }
});

test('a successful response resets the failure counter', async () => {
  const noise = await startNoiseServer([{ kind: 'hang' }, { kind: 'signal' }]);
  try {
    const loop = await loopOn(noise.url, () => 0);
    await loop.tickOnce();
    assert.equal(loop.failures(), 1);
    await loop.tickOnce();
    assert.equal(loop.failures(), 0);
  } finally {
    await noise.close();
  }
});

test('an hour of noise makes no extra requests', async () => {
  const noise = await startNoiseServer([
    { kind: 'broken' }, { kind: 'foreign' }, { kind: 'forgery' }, { kind: 'signal' },
  ]);
  try {
    let clock = 0;
    const loop = await loopOn(noise.url, () => clock);
    for (let i = 0; i < 240; i += 1) {
      await loop.tickOnce();
      clock += 15_000;
    }
    assert.equal(noise.requestCount(), 240, 'exactly one request per tick');
    assert.ok(loop.state().ribbon.length > 0);
  } finally {
    await noise.close();
  }
});

test('a slow but genuine response still updates state once it arrives', async () => {
  const noise = await startNoiseServer([{ kind: 'delay', ms: 50 }]);
  try {
    const loop = await loopOn(noise.url, () => 0);
    await loop.tickOnce();
    assert.equal(loop.state().phase, 'static');
    assert.equal(loop.failures(), 0);
  } finally {
    await noise.close();
  }
});

test('a connection cut mid-body counts as a failure, not a signal', async () => {
  const noise = await startNoiseServer([{ kind: 'partial' }]);
  try {
    const loop = await loopOn(noise.url, () => 0);
    await loop.tickOnce();
    assert.equal(loop.failures(), 1);
    assert.equal(loop.state().phase, null);
  } finally {
    await noise.close();
  }
});

test('on() listeners receive the reduced state and the observation', async () => {
  const noise = await startNoiseServer([{ kind: 'signal' }]);
  try {
    const loop = await loopOn(noise.url, () => 0);
    const seen: Array<{ phase: unknown; observationType: string }> = [];
    loop.on((s, o) => seen.push({ phase: s.phase, observationType: o.t }));
    await loop.tickOnce();
    assert.equal(seen.length, 1);
    assert.equal(seen[0].phase, 'static');
    assert.equal(seen[0].observationType, 'signal');
  } finally {
    await noise.close();
  }
});

test('a slow response past the timeout counts as a timeout failure', async () => {
  const noise = await startNoiseServer([{ kind: 'delay', ms: 300 }]);
  try {
    const ring = new KeyRing();
    ring.add(await makeStationKey(LEARNING_PUBLIC_KEY, LEARNING_FINGERPRINT));
    const loop = new EtherLoop({
      api: noise.url, ring, timeoutMs: 50, intervalMs: 15_000,
      capacity: 20, refillMs: 3000, now: () => 0,
      rand: () => 0,
    });
    await loop.tickOnce();
    assert.equal(loop.failures(), 1);
    assert.equal(loop.state().ribbon.at(-1), 'silence');
  } finally {
    await noise.close();
  }
});

test('start() and stop() do not leak the interval timer', async () => {
  const noise = await startNoiseServer([{ kind: 'signal' }]);
  try {
    const loop = await loopOn(noise.url, () => 0);
    loop.start();
    loop.start();
    loop.stop();
    loop.stop();
  } finally {
    await noise.close();
  }
});
