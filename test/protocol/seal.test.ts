import test from 'node:test';
import assert from 'node:assert/strict';
import { b64uToBytes, sha256Hex } from '../../src/protocol/bytes.ts';
import { makeStationKey, KeyRing } from '../../src/protocol/keyring.ts';
import { verifySeal } from '../../src/protocol/seal.ts';
import {
  FRAME_A, FRAME_B, FRAME_D,
  LEARNING_PUBLIC_KEY, LEARNING_FINGERPRINT, LEARNING_KEY_ID,
} from '../fixtures/frames.ts';

test('public key is 32 bytes', () => {
  assert.equal(b64uToBytes(LEARNING_PUBLIC_KEY).length, 32);
});

test('key fingerprint matches the published one', async () => {
  assert.equal(await sha256Hex(b64uToBytes(LEARNING_PUBLIC_KEY)), LEARNING_FINGERPRINT);
});

test('a key with a mismatched fingerprint is rejected (CL-04)', async () => {
  await assert.rejects(
    () => makeStationKey(LEARNING_PUBLIC_KEY, 'f'.repeat(64)),
    /fingerprint/,
  );
});

test('key id is the first 16 characters of the fingerprint', async () => {
  const key = await makeStationKey(LEARNING_PUBLIC_KEY, LEARNING_FINGERPRINT);
  assert.equal(key.id, LEARNING_KEY_ID);
});

test('frame A: seal is genuine', async () => {
  const key = await makeStationKey(LEARNING_PUBLIC_KEY, LEARNING_FINGERPRINT);
  assert.equal(await verifySeal(key, FRAME_A.seal, FRAME_A.frame), true);
});

test('frame D: seal is genuine', async () => {
  const key = await makeStationKey(LEARNING_PUBLIC_KEY, LEARNING_FINGERPRINT);
  assert.equal(await verifySeal(key, FRAME_D.seal, FRAME_D.frame), true);
});

test('frame B: forgery does not pass', async () => {
  const key = await makeStationKey(LEARNING_PUBLIC_KEY, LEARNING_FINGERPRINT);
  assert.equal(await verifySeal(key, FRAME_B.seal, FRAME_B.frame), false);
});

test('changing a single character in the frame breaks the seal', async () => {
  const key = await makeStationKey(LEARNING_PUBLIC_KEY, LEARNING_FINGERPRINT);
  const tampered = FRAME_A.frame.replace('"onAir":0', '"onAir":1');
  assert.equal(await verifySeal(key, FRAME_A.seal, tampered), false);
});

test('KeyRing returns a key by id and does not know a stranger', async () => {
  const ring = new KeyRing();
  ring.add(await makeStationKey(LEARNING_PUBLIC_KEY, LEARNING_FINGERPRINT));
  assert.ok(ring.get(LEARNING_KEY_ID));
  assert.equal(ring.get('0000000000000000'), undefined);
});

test('a re-serialised frame with identical meaning fails the seal', async () => {
  const key = await makeStationKey(LEARNING_PUBLIC_KEY, LEARNING_FINGERPRINT);
  const reserialized = JSON.stringify(JSON.parse(FRAME_A.frame), null, 2);
  assert.equal(await verifySeal(key, FRAME_A.seal, reserialized), false);
});
