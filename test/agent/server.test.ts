import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeApi } from './fake-api.ts';
import { fetchRepoAccess, makeCaller, type TokenSource } from '../../src/agent/server.ts';

const T1 = 'A'.repeat(43);
const T2 = 'B'.repeat(43);

function tokens(first: string | null, renewed: string | null): TokenSource & { renewals: number } {
  const t = {
    renewals: 0,
    token: async () => first,
    renew: async () => { t.renewals += 1; return renewed; },
  };
  return t;
}

test('sends the bearer token and parses JSON', async () => {
  const api = await fakeApi({ '/me/summary': [() => ({ status: 200, body: '{"unread":0}' })] });
  try {
    const call = makeCaller({ api: api.url, session: tokens(T1, null), timeoutMs: 2000 });
    const r = await call('GET', '/me/summary');
    assert.deepEqual(r, { ok: true, status: 200, data: { unread: 0 } });
    assert.equal(api.seen[0].auth, `Bearer ${T1}`);
  } finally { api.server.close(); }
});

test('POST sends an empty JSON object with the JSON content type', async () => {
  const api = await fakeApi({ '/stages/x/ack': [() => ({ status: 200, body: '{}' })] });
  try {
    const call = makeCaller({ api: api.url, session: tokens(T1, null), timeoutMs: 2000 });
    await call('POST', '/stages/x/ack');
    assert.equal(api.seen[0].method, 'POST');
    assert.equal(api.seen[0].body, '{}');
  } finally { api.server.close(); }
});

test('a 401 renews the session and retries exactly once', async () => {
  const api = await fakeApi({
    '/me/summary': [
      () => ({ status: 401, body: '{"error":{"code":"authentication-required"}}' }),
      () => ({ status: 401, body: '{"error":{"code":"authentication-required"}}' }),
      () => ({ status: 200, body: '{}' }),
    ],
  });
  try {
    const s = tokens(T1, T2);
    const call = makeCaller({ api: api.url, session: s, timeoutMs: 2000 });
    const r = await call('GET', '/me/summary');
    assert.equal(r.ok, false);
    assert.equal(r.status, 401);
    assert.equal(s.renewals, 1);
    assert.deepEqual(api.seen.map((x) => x.auth), [`Bearer ${T1}`, `Bearer ${T2}`]);
  } finally { api.server.close(); }
});

test('when renewal fails the first 401 is returned without a second request', async () => {
  const api = await fakeApi({ '/me/summary': [() => ({ status: 401, body: '' })] });
  try {
    const call = makeCaller({ api: api.url, session: tokens(T1, null), timeoutMs: 2000 });
    const r = await call('GET', '/me/summary');
    assert.equal(r.status, 401);
    assert.equal(api.hits.length, 1);
  } finally { api.server.close(); }
});

test('no token means no request', async () => {
  const api = await fakeApi({});
  try {
    const call = makeCaller({ api: api.url, session: tokens(null, null), timeoutMs: 2000 });
    const r = await call('GET', '/me/summary');
    assert.deepEqual(r, { ok: false, status: 0, code: 'no-session', requestId: null, retryAfter: null });
    assert.equal(api.hits.length, 0);
  } finally { api.server.close(); }
});

test('odd answers never throw: HTML 502, empty 200, non-JSON 200, 429 with Retry-After, dropped connection', async () => {
  const api = await fakeApi({
    '/a': [() => ({ status: 502, body: '<html>bad gateway</html>', requestId: 'r-1' })],
    '/b': [() => ({ status: 200, body: '' })],
    '/c': [() => ({ status: 200, body: 'not json' })],
    '/d': [() => ({ status: 429, body: '{"error":{"code":"rate-limited"}}', retryAfter: 60 })],
    '/e': [() => 'hang'],
  });
  try {
    const call = makeCaller({ api: api.url, session: tokens(T1, null), timeoutMs: 500 });
    assert.deepEqual(await call('GET', '/a'), { ok: false, status: 502, code: null, requestId: 'r-1', retryAfter: null });
    assert.deepEqual(await call('GET', '/b'), { ok: true, status: 200, data: null });
    assert.equal((await call('GET', '/c')).ok, false);
    assert.deepEqual(await call('GET', '/d'), { ok: false, status: 429, code: 'rate-limited', requestId: null, retryAfter: 60 });
    const e = await call('GET', '/e');
    assert.equal(e.status, 0);
    assert.ok(!e.ok && (e.code === 'network' || e.code === 'timeout'));
  } finally { api.server.close(); }
});

test('the public config is read without a token', async () => {
  const api = await fakeApi({
    '/public/config': [() => ({ status: 200, body: JSON.stringify({ repositoryAccess: { githubUsername: 'zoria-net-bot', permission: 'W', instructions: 'I' } }) })],
  });
  try {
    const got = await fetchRepoAccess(api.url, 2000);
    assert.equal(got?.githubUsername, 'zoria-net-bot');
    assert.equal(api.seen[0].auth, null);
  } finally { api.server.close(); }
});
