import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStationKey, KeyRing } from '../../src/protocol/keyring.ts';
import { classifyResponse } from '../../src/protocol/classify.ts';
import {
  FRAME_A, FRAME_B, LEARNING_PUBLIC_KEY, LEARNING_FINGERPRINT,
} from '../fixtures/frames.ts';

async function ring(): Promise<KeyRing> {
  const r = new KeyRing();
  r.add(await makeStationKey(LEARNING_PUBLIC_KEY, LEARNING_FINGERPRINT));
  return r;
}

test('200 with an envelope — signal, frame time in milliseconds', async () => {
  const o = await classifyResponse(
    { status: 200, retryAfterSeconds: null, body: JSON.stringify(FRAME_A), receivedAt: 1000 },
    await ring(),
  );
  assert.equal(o.t, 'signal');
  if (o.t !== 'signal') return;
  assert.equal(o.frameAt, Date.parse('2026-09-24T03:00:00.000Z'));
  assert.equal(o.receivedAt, 1000);
});

test('503 with an envelope — still a signal, not a failure (CL-09)', async () => {
  const o = await classifyResponse(
    { status: 503, retryAfterSeconds: 30, body: JSON.stringify(FRAME_A), receivedAt: 1000 },
    await ring(),
  );
  assert.equal(o.t, 'signal');
});

test('503 stopping without an envelope — node silence', async () => {
  const body = JSON.stringify({ error: { code: 'stopping', message: 'Node is not yet on the air' } });
  const o = await classifyResponse(
    { status: 503, retryAfterSeconds: 30, body, receivedAt: 1000 },
    await ring(),
  );
  assert.deepEqual(o, { t: 'stopping', retryAfterMs: 30000, receivedAt: 1000 });
});

test('429 jammed — always a genuine silence instruction, duration from Retry-After', async () => {
  const body = JSON.stringify({ error: { code: 'jammed' } });
  const o = await classifyResponse(
    { status: 429, retryAfterSeconds: 120, body, receivedAt: 1000 },
    await ring(),
  );
  assert.deepEqual(o, { t: 'jammed', retryAfterMs: 120000, receivedAt: 1000 });
});

test('429 without Retry-After — cautious default pause of 60s', async () => {
  const o = await classifyResponse(
    { status: 429, retryAfterSeconds: null, body: '{}', receivedAt: 0 },
    await ring(),
  );
  assert.equal(o.t, 'jammed');
  if (o.t !== 'jammed') return;
  assert.equal(o.retryAfterMs, 60000);
});

test('forgery — noise with a status', async () => {
  const o = await classifyResponse(
    { status: 200, retryAfterSeconds: null, body: JSON.stringify(FRAME_B), receivedAt: 5 },
    await ring(),
  );
  assert.deepEqual(o, { t: 'noise', why: 'bad-seal', status: 200, receivedAt: 5 });
});

test('an unrelated code with a plausible error — noise', async () => {
  const body = JSON.stringify({ error: { code: 'username-unavailable', field: 'username' } });
  const o = await classifyResponse(
    { status: 409, retryAfterSeconds: null, body, receivedAt: 5 },
    await ring(),
  );
  assert.equal(o.t, 'noise');
});

test('418 with an empty body — noise', async () => {
  const o = await classifyResponse(
    { status: 418, retryAfterSeconds: null, body: '', receivedAt: 5 },
    await ring(),
  );
  assert.deepEqual(o, { t: 'noise', why: 'not-json', status: 418, receivedAt: 5 });
});

test('502 with an HTML error — noise (not node silence)', async () => {
  const body = '<html><body>Bad Gateway</body></html>';
  const o = await classifyResponse(
    { status: 502, retryAfterSeconds: null, body, receivedAt: 42 },
    await ring(),
  );
  assert.deepEqual(o, { t: 'noise', why: 'not-json', status: 502, receivedAt: 42 });
});

test('503 stopping without Retry-After — typical default pause of 30s', async () => {
  const body = JSON.stringify({ error: { code: 'stopping' } });
  const o = await classifyResponse(
    { status: 503, retryAfterSeconds: null, body, receivedAt: 1000 },
    await ring(),
  );
  assert.deepEqual(o, { t: 'stopping', retryAfterMs: 30000, receivedAt: 1000 });
});

test('a 429 carrying a valid envelope is still jammed', async () => {
  const o = await classifyResponse(
    { status: 429, retryAfterSeconds: 30, body: JSON.stringify(FRAME_A), receivedAt: 1000 },
    await ring(),
  );
  assert.deepEqual(o, { t: 'jammed', retryAfterMs: 30000, receivedAt: 1000 });
});
