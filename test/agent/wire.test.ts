import test from 'node:test';
import assert from 'node:assert/strict';
import { asPublicKey } from '../../src/agent/wire.ts';

test('the station key is read from /ether/key, anything else is null', () => {
  assert.equal(asPublicKey('{"algorithm":"Ed25519","publicKey":"GQgs"}'), 'GQgs');
  for (const body of ['', '<html>', 'null', '{"publicKey":7}', '[]']) assert.equal(asPublicKey(body), null, body);
});
