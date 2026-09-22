import test from 'node:test';
import assert from 'node:assert/strict';
import { startNoiseServer } from './noise-server.ts';
import { fetchRaw } from '../../src/agent/http.ts';
import { makeStationKey, KeyRing } from '../../src/protocol/keyring.ts';
import { classifyResponse } from '../../src/protocol/classify.ts';
import { LEARNING_PUBLIC_KEY, LEARNING_FINGERPRINT, FRAME_D } from '../fixtures/frames.ts';

async function ring(): Promise<KeyRing> {
  const r = new KeyRing();
  r.add(await makeStationKey(LEARNING_PUBLIC_KEY, LEARNING_FINGERPRINT));
  return r;
}

test('each interference kind classifies as expected', async () => {
  const noise = await startNoiseServer([
    { kind: 'signal' }, { kind: 'forgery' }, { kind: 'broken' },
    { kind: 'foreign' }, { kind: 'stopping' }, { kind: 'jammed' },
  ]);
  const r = await ring();
  try {
    const kinds: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const raw = await fetchRaw(`${noise.url}/ether`, {}, 3000);
      assert.ok(!('failed' in raw));
      if ('failed' in raw) return;
      const o = await classifyResponse(raw, r);
      kinds.push(o.t === 'noise' ? `noise:${o.why}` : o.t);
    }
    assert.deepEqual(kinds, [
      'signal', 'noise:bad-seal', 'noise:not-json',
      'noise:bad-shape', 'stopping', 'jammed',
    ]);
  } finally {
    await noise.close();
  }
});

test('connection break does not throw exception', async () => {
  const noise = await startNoiseServer([{ kind: 'hang' }]);
  try {
    const raw = await fetchRaw(`${noise.url}/ether`, {}, 3000, () => 1);
    assert.deepEqual(raw, { failed: 'network', receivedAt: 1 });
  } finally {
    await noise.close();
  }
});

test('requestCount reflects requests served', async () => {
  const noise = await startNoiseServer([{ kind: 'signal' }]);
  try {
    assert.equal(noise.requestCount(), 0);
    await fetchRaw(`${noise.url}/ether`, {}, 3000);
    assert.equal(noise.requestCount(), 1);
    await fetchRaw(`${noise.url}/ether`, {}, 3000);
    assert.equal(noise.requestCount(), 2);
  } finally {
    await noise.close();
  }
});

test('setScript replaces script and restarts at first step', async () => {
  const noise = await startNoiseServer([
    { kind: 'signal' }, { kind: 'forgery' }, { kind: 'broken' },
  ]);
  const r = await ring();
  try {
    const raw1 = await fetchRaw(`${noise.url}/ether`, {}, 3000);
    assert.ok(!('failed' in raw1));
    if ('failed' in raw1) return;
    const o1 = await classifyResponse(raw1, r);
    assert.equal(o1.t, 'signal');

    noise.setScript([{ kind: 'forgery' }, { kind: 'jammed' }]);

    const raw2 = await fetchRaw(`${noise.url}/ether`, {}, 3000);
    assert.ok(!('failed' in raw2));
    if ('failed' in raw2) return;
    const o2 = await classifyResponse(raw2, r);
    assert.equal(o2.t, 'noise');

    const raw3 = await fetchRaw(`${noise.url}/ether`, {}, 3000);
    assert.ok(!('failed' in raw3));
    if ('failed' in raw3) return;
    const o3 = await classifyResponse(raw3, r);
    assert.equal(o3.t, 'jammed');
  } finally {
    await noise.close();
  }
});

test('script wraps around cyclically', async () => {
  const noise = await startNoiseServer([
    { kind: 'signal' }, { kind: 'forgery' }, { kind: 'broken' },
  ]);
  const r = await ring();
  try {
    const kinds: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const raw = await fetchRaw(`${noise.url}/ether`, {}, 3000);
      assert.ok(!('failed' in raw));
      if ('failed' in raw) return;
      const o = await classifyResponse(raw, r);
      kinds.push(o.t === 'noise' ? `noise:${o.why}` : o.t);
    }
    assert.deepEqual(kinds, [
      'signal', 'noise:bad-seal', 'noise:not-json',
      'signal', 'noise:bad-seal', 'noise:not-json',
      'signal',
    ]);
  } finally {
    await noise.close();
  }
});

test('signal with overridden frame and seal', async () => {
  const noise = await startNoiseServer([
    { kind: 'signal', frame: FRAME_D.frame, seal: FRAME_D.seal },
  ]);
  const r = await ring();
  try {
    const raw = await fetchRaw(`${noise.url}/ether`, {}, 3000);
    assert.ok(!('failed' in raw));
    if ('failed' in raw) return;
    const o = await classifyResponse(raw, r);
    assert.equal(o.t, 'signal');
    if (o.t === 'signal') {
      assert.equal(o.frame.kind, 'roll');
    }
  } finally {
    await noise.close();
  }
});

test('partial response classifies as transport failure', async () => {
  const noise = await startNoiseServer([{ kind: 'partial' }]);
  try {
    const raw = await fetchRaw(`${noise.url}/ether`, {}, 3000, () => 42);
    assert.deepEqual(raw, { failed: 'network', receivedAt: 42 });
  } finally {
    await noise.close();
  }
});

test('delay responds with genuine signal after waiting', async () => {
  const noise = await startNoiseServer([{ kind: 'delay', ms: 50 }]);
  const r = await ring();
  try {
    const raw = await fetchRaw(`${noise.url}/ether`, {}, 3000);
    assert.ok(!('failed' in raw));
    if ('failed' in raw) return;
    const o = await classifyResponse(raw, r);
    assert.equal(o.t, 'signal');
  } finally {
    await noise.close();
  }
});
