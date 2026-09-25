import test from 'node:test';
import assert from 'node:assert/strict';
import { describeFailure } from '../../src/client/terminal/errors.ts';

const f = (status: number, code: string | null = null, requestId: string | null = null, retryAfter: number | null = null) =>
  ({ status, code, requestId, retryAfter });

test('a 5xx names the request id for the failure report', () => {
  assert.deepEqual(describeFailure(f(500, 'internal-error', 'req-42')), ['SERVER ERROR 500', 'REQ req-42']);
});

test('503 stopping is a pause, not a jam', () => {
  assert.equal(describeFailure(f(503, 'stopping', 'r'))[0], 'PAUSED   server restarting');
});

test('each status family gets its own words', () => {
  assert.equal(describeFailure(f(429, 'rate-limited', null, 60))[0], 'WAIT 60s   rate-limited');
  assert.equal(describeFailure(f(401))[0], 'SIGN-IN NEEDED   type LOGIN');
  assert.equal(describeFailure(f(404))[0], 'NOT FOUND OR NOT RELEASED YET');
  assert.equal(describeFailure(f(409, 'session-limit'))[0], 'CONFLICT   session-limit');
  assert.equal(describeFailure(f(0, 'no-session'))[0], 'NOT SIGNED IN   type LOGIN');
  assert.equal(describeFailure(f(0, 'agent-offline'))[0], 'AGENT OFFLINE');
  assert.equal(describeFailure(f(0, 'timeout'))[0], 'SERVER TIMED OUT, retrying');
  assert.equal(describeFailure(f(418, 'teapot'))[0], 'REQUEST ERROR 418   teapot');
});

test('every line fits the 46-column screen', () => {
  for (const x of [f(502, null, '0123456789abcdef0123456789abcdef0123'), f(429, 'authentication-busy', null, 5), f(403, 'same-origin-required')]) {
    for (const line of describeFailure(x)) assert.ok(Array.from(line).length <= 46, line);
  }
});

test('local reply problems are named as such, not as a lost server link', () => {
  assert.equal(describeFailure(f(0, 'bad-reply'))[0], 'AGENT SENT A BROKEN REPLY');
  assert.equal(describeFailure(f(0, 'cancelled'))[0], 'CANCELLED');
});
