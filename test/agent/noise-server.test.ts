import test from 'node:test';
import assert from 'node:assert/strict';
import { startNoiseServer } from './noise-server.ts';
import { fetchRaw } from '../../src/agent/http.ts';
import { makeStationKey, KeyRing } from '../../src/protocol/keyring.ts';
import { classifyResponse } from '../../src/protocol/classify.ts';
import { LEARNING_PUBLIC_KEY, LEARNING_FINGERPRINT } from '../fixtures/frames.ts';

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
