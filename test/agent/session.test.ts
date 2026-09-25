import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeApi } from './fake-api.ts';
import { Session } from '../../src/agent/session.ts';
import { StateBox, emptyState, loadState, type AgentState, type Application } from '../../src/agent/store.ts';

const APP: Application = {
  username: 'north', displayName: 'Northern Watch', password: 'correct-horse-battery',
  invitation: 'CODE-123', repositoryUrl: 'north/zoria-client', lang: 'uk',
};
const T1 = 'A'.repeat(43);
const T2 = 'B'.repeat(43);
const NOW = Date.parse('2026-09-26T06:00:00.000Z');
const grant = (token: string, expiresAt = '2026-09-27T06:00:00.000Z') =>
  ({ status: 200, body: JSON.stringify({ token, sessionId: 's', expiresAt, user: {} }) });

async function box(reg: Partial<AgentState['registration']>): Promise<{ box: StateBox; path: string }> {
  const path = join(await mkdtemp(join(tmpdir(), 'zoria-')), 'state.json');
  const s = emptyState();
  return { path, box: new StateBox(path, { ...s, application: APP, registration: { ...s.registration, ...reg } }) };
}

test('an unregistered agent has no session and makes no request', async () => {
  const api = await fakeApi({});
  try {
    const { box: b } = await box({});
    const s = new Session({ api: api.url, store: b, now: () => NOW });
    assert.equal(s.state(), 'none');
    assert.equal(await s.token(), null);
    assert.equal(api.hits.length, 0);
  } finally { api.server.close(); }
});

test('expired token on start signs in before any call', async () => {
  const api = await fakeApi({ '/auth/login': [() => grant(T2)] });
  try {
    const { box: b, path } = await box({ registered: true, token: T1, expiresAt: '2026-09-26T05:00:00.000Z' });
    const s = new Session({ api: api.url, store: b, now: () => NOW });
    assert.equal(s.state(), 'expired');
    assert.equal(await s.token(), T2);
    assert.equal(s.state(), 'active');
    assert.equal((await loadState(path)).registration.token, T2);
    assert.deepEqual(JSON.parse(api.seen[0].body), { username: 'north', password: 'correct-horse-battery' });
  } finally { api.server.close(); }
});

test('a token that ends in less than ten minutes is renewed; a fresh one is not', async () => {
  const api = await fakeApi({ '/auth/login': [() => grant(T2)] });
  try {
    const { box: b } = await box({ registered: true, token: T1, expiresAt: new Date(NOW + 5 * 60_000).toISOString() });
    const s = new Session({ api: api.url, store: b, now: () => NOW });
    assert.equal(await s.token(), T2);
    assert.equal(await s.token(), T2);
    assert.equal(api.hits.length, 1);
  } finally { api.server.close(); }
});

test('concurrent callers share one sign-in', async () => {
  const api = await fakeApi({ '/auth/login': [() => grant(T2)] });
  try {
    const { box: b } = await box({ registered: true });
    const s = new Session({ api: api.url, store: b, now: () => NOW });
    const got = await Promise.all([s.token(), s.token(), s.token()]);
    assert.deepEqual(got, [T2, T2, T2]);
    assert.equal(api.hits.length, 1);
  } finally { api.server.close(); }
});

test('invalid credentials stop automatic sign-in until LOGIN', async () => {
  const api = await fakeApi({
    '/auth/login': [
      () => ({ status: 401, body: JSON.stringify({ error: { code: 'invalid-credentials' } }) }),
      () => grant(T2),
    ],
  });
  try {
    const { box: b } = await box({ registered: true });
    const s = new Session({ api: api.url, store: b, now: () => NOW });
    assert.equal(await s.token(), null);
    assert.equal(s.state(), 'rejected');
    assert.equal(await s.token(), null);
    assert.equal(api.hits.length, 1);
    assert.equal(await s.login(), true);
    assert.equal(s.state(), 'active');
  } finally { api.server.close(); }
});

test('429 on sign-in waits for Retry-After before the next attempt', async () => {
  let clock = NOW;
  const api = await fakeApi({
    '/auth/login': [
      () => ({ status: 429, body: JSON.stringify({ error: { code: 'rate-limited' } }), retryAfter: 60 }),
      () => grant(T2),
    ],
  });
  try {
    const { box: b } = await box({ registered: true });
    const s = new Session({ api: api.url, store: b, now: () => clock });
    assert.equal(await s.token(), null);
    clock += 59_000;
    assert.equal(await s.token(), null);
    assert.equal(api.hits.length, 1);
    clock += 1_000;
    assert.equal(await s.token(), T2);
  } finally { api.server.close(); }
});

test('a network failure backs off instead of hammering the server', async () => {
  let clock = NOW;
  const api = await fakeApi({ '/auth/login': [() => 'hang', () => grant(T2)] });
  try {
    const { box: b } = await box({ registered: true });
    const s = new Session({ api: api.url, store: b, now: () => clock, rand: () => 1, timeoutMs: 500 });
    assert.equal(await s.token(), null);
    assert.equal(s.lastError(), 'network');
    assert.equal(await s.token(), null);
    assert.equal(api.hits.length, 1);
    clock += 1_000;
    assert.equal(await s.token(), T2);
  } finally { api.server.close(); }
});

test('logout wipes the token on disk even when the server does not answer', async () => {
  const api = await fakeApi({ '/auth/logout': [() => 'hang'] });
  try {
    const { box: b, path } = await box({ registered: true, token: T1, expiresAt: '2026-09-27T06:00:00.000Z' });
    const s = new Session({ api: api.url, store: b, now: () => NOW, timeoutMs: 500 });
    await s.logout();
    assert.equal(s.state(), 'logged-out');
    assert.equal((await loadState(path)).registration.token, null);
    assert.equal((await loadState(path)).registration.registered, true);
    assert.equal(api.seen[0].auth, `Bearer ${T1}`);
    assert.equal(await s.token(), null);
    assert.equal(api.hits.length, 1);
  } finally { api.server.close(); }
});

test('renew returns a token someone else already refreshed, without a request', async () => {
  const api = await fakeApi({});
  try {
    const { box: b } = await box({ registered: true, token: T2, expiresAt: '2026-09-27T06:00:00.000Z' });
    const s = new Session({ api: api.url, store: b, now: () => NOW });
    assert.equal(await s.renew(T1), T2);
    assert.equal(api.hits.length, 0);
  } finally { api.server.close(); }
});

test('renew of the current token signs in again', async () => {
  const api = await fakeApi({ '/auth/login': [() => grant(T2)] });
  try {
    const { box: b } = await box({ registered: true, token: T1, expiresAt: '2026-09-27T06:00:00.000Z' });
    const s = new Session({ api: api.url, store: b, now: () => NOW });
    assert.equal(await s.renew(T1), T2);
  } finally { api.server.close(); }
});

test('a sign-in that finishes after LOGOUT is thrown away and revoked', async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => { release = r; });
  const api = await fakeApi({
    '/auth/login': [async () => { await gate; return grant(T2); }],
    '/auth/logout': [() => ({ status: 204, body: '' })],
  });
  try {
    const { box: b, path } = await box({ registered: true });
    const s = new Session({ api: api.url, store: b, now: () => NOW });
    const pending = s.token();
    await new Promise((r) => setTimeout(r, 30));
    await s.logout();
    release();
    assert.equal(await pending, null);
    assert.equal((await loadState(path)).registration.token, null);
    assert.equal(s.state(), 'logged-out');
    assert.ok(api.seen.some((x) => x.path === '/auth/logout' && x.auth === `Bearer ${T2}`), 'the late token is revoked');
  } finally { api.server.close(); }
});

test('LOGIN respects a Retry-After the server asked for', async () => {
  const api = await fakeApi({
    '/auth/login': [() => ({ status: 429, body: JSON.stringify({ error: { code: 'rate-limited' } }), retryAfter: 60 }), () => grant(T2)],
  });
  try {
    const { box: b } = await box({ registered: true });
    const s = new Session({ api: api.url, store: b, now: () => NOW });
    assert.equal(await s.token(), null);
    assert.equal(await s.login(), false);
    assert.equal(api.hits.length, 1);
  } finally { api.server.close(); }
});

test('a grant without a readable expiry is treated as a day long, not as already expired', async () => {
  const api = await fakeApi({ '/auth/login': [() => grant(T2, 'soon')] });
  try {
    const { box: b } = await box({ registered: true });
    const s = new Session({ api: api.url, store: b, now: () => NOW });
    assert.equal(await s.token(), T2);
    assert.equal(await s.token(), T2);
    assert.equal(api.hits.length, 1);
  } finally { api.server.close(); }
});
