import test from 'node:test';
import assert from 'node:assert/strict';
import { errorCode } from '../../src/protocol/error-code.ts';

test('the error code is read only from a well-formed error object', () => {
  assert.equal(errorCode('{"error":{"code":"stopping"}}'), 'stopping');
  for (const body of ['', 'not json', '<html>', 'null', '[]', '{"error":null}', '{"error":{"code":5}}']) {
    assert.equal(errorCode(body), null, body);
  }
});
