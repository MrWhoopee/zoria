import test from 'node:test';
import assert from 'node:assert/strict';
import { readOutcome } from '../../src/client/agent/outcome.ts';

test('success passes its fields through', () => {
  assert.deepEqual(readOutcome({ ok: true, entries: [] }), { ok: true, entries: [] });
});

test('failure keeps status, code, request id and wait', () => {
  assert.deepEqual(
    readOutcome({ ok: false, status: 503, code: 'stopping', requestId: 'r', retryAfter: 30 }),
    { ok: false, status: 503, code: 'stopping', requestId: 'r', retryAfter: 30 },
  );
});

test('anything else is an unreadable reply, never a throw', () => {
  for (const v of [null, 'x', [], {}, { ok: 'yes' }]) {
    const r = readOutcome(v);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'bad-reply');
  }
});
