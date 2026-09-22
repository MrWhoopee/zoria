import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStationKey, KeyRing } from '../../src/protocol/keyring.ts';
import { verifyEnvelope } from '../../src/protocol/envelope.ts';
import {
  FRAME_A, FRAME_B, FRAME_C_TEXT, FRAME_D,
  LEARNING_PUBLIC_KEY, LEARNING_FINGERPRINT, LEARNING_KEY_ID,
} from '../fixtures/frames.ts';
import { sealFrame, GENERATED_PUBLIC_KEY, GENERATED_FINGERPRINT, GENERATED_KEY_ID } from '../fixtures/sign.ts';

async function ring(): Promise<KeyRing> {
  const r = new KeyRing();
  r.add(await makeStationKey(LEARNING_PUBLIC_KEY, LEARNING_FINGERPRINT));
  r.add(await makeStationKey(GENERATED_PUBLIC_KEY, GENERATED_FINGERPRINT));
  return r;
}

test('frame A — signal with a parsed frame', async () => {
  const v = await verifyEnvelope(JSON.stringify(FRAME_A), await ring());
  assert.equal(v.kind, 'signal');
  if (v.kind !== 'signal') return;
  assert.equal(v.frame.phase, 'static');
  assert.equal(v.frame.harbinger?.opensIn, 21600);
  assert.equal(v.frame.fragment?.n, 3);
  assert.equal(v.keyId, LEARNING_KEY_ID);
});

test('frame B — forgery', async () => {
  const v = await verifyEnvelope(JSON.stringify(FRAME_B), await ring());
  assert.deepEqual(v, { kind: 'noise', why: 'bad-seal' });
});

test('frame C — corrupt, does not parse', async () => {
  const v = await verifyEnvelope(FRAME_C_TEXT, await ring());
  assert.deepEqual(v, { kind: 'noise', why: 'not-json' });
});

test('frame D — signal with a check-in log', async () => {
  const v = await verifyEnvelope(JSON.stringify(FRAME_D), await ring());
  assert.equal(v.kind, 'signal');
  if (v.kind !== 'signal') return;
  assert.equal(v.frame.kind, 'roll');
  assert.equal(v.frame.roll?.length, 2);
  assert.equal(v.frame.roll?.[0].name, 'Північна вахта');
});

test('empty body — noise', async () => {
  assert.deepEqual(await verifyEnvelope('', await ring()), { kind: 'noise', why: 'not-json' });
});

test('HTML — noise', async () => {
  const v = await verifyEnvelope('<html><body>502</body></html>', await ring());
  assert.deepEqual(v, { kind: 'noise', why: 'not-json' });
});

test('JSON without a top-level object — noise', async () => {
  assert.deepEqual(await verifyEnvelope('[1,2,3]', await ring()), { kind: 'noise', why: 'bad-shape' });
});

test('plausible API error — noise, not a rejection', async () => {
  const body = JSON.stringify({ error: { code: 'invalid-invitation', field: 'invitation' } });
  assert.deepEqual(await verifyEnvelope(body, await ring()), { kind: 'noise', why: 'bad-shape' });
});

test('unknown key — its own reason', async () => {
  const body = JSON.stringify({ ...FRAME_A, key: '0123456789abcdef' });
  assert.deepEqual(await verifyEnvelope(body, await ring()), { kind: 'noise', why: 'unknown-key' });
});

test('unsupported protocol version — noise with a genuine seal', async () => {
  const frameText = '{"v":2,"kind":"signal","station":"zoria","at":"2026-09-24T03:00:00.000Z","phase":"static","window":null,"harbinger":null,"fragment":null,"onAir":0}';
  const seal = await sealFrame(frameText);
  const body = JSON.stringify({ frame: frameText, seal, key: GENERATED_KEY_ID });
  const v = await verifyEnvelope(body, await ring());
  assert.deepEqual(v, { kind: 'noise', why: 'wrong-version' });
});

test('unknown envelope fields are ignored (CL-06)', async () => {
  const body = JSON.stringify({ ...FRAME_A, futureField: 'whatever' });
  const v = await verifyEnvelope(body, await ring());
  assert.equal(v.kind, 'signal');
});

test('unrecognized station — noise with a genuine seal', async () => {
  const frameText = '{"v":1,"kind":"signal","station":"echo","at":"2026-09-24T03:00:00.000Z","phase":"static","window":null,"harbinger":null,"fragment":null,"onAir":0}';
  const seal = await sealFrame(frameText);
  const body = JSON.stringify({ frame: frameText, seal, key: GENERATED_KEY_ID });
  const v = await verifyEnvelope(body, await ring());
  assert.deepEqual(v, { kind: 'noise', why: 'wrong-station' });
});

test('a frame that is not a JSON object — noise with a genuine seal', async () => {
  const frameText = 'not json at all';
  const seal = await sealFrame(frameText);
  const body = JSON.stringify({ frame: frameText, seal, key: GENERATED_KEY_ID });
  const v = await verifyEnvelope(body, await ring());
  assert.deepEqual(v, { kind: 'noise', why: 'bad-frame' });
});

test('a bad seal is reported before an unparseable frame', async () => {
  const body = JSON.stringify({ frame: 'not json at all', seal: FRAME_A.seal, key: LEARNING_KEY_ID });
  const v = await verifyEnvelope(body, await ring());
  assert.deepEqual(v, { kind: 'noise', why: 'bad-seal' });
});
