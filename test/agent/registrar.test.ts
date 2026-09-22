import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { Registrar } from '../../src/agent/registrar.ts';
import { emptyState, loadState, type Application } from '../../src/agent/store.ts';
import { initialEther, type EtherState } from '../../src/protocol/ether.ts';

const APP: Application = {
  username: 'north', displayName: 'Northern Watch', password: 'correct-horse-battery',
  invitation: 'CODE-123', repositoryUrl: 'north/zoria-client', lang: 'uk',
};

const SESSION = {
  token: 'fJp9HfUeN_fA6pcc7H0hQoGerwUCs7lfTDkZDltKPeE',
  sessionId: '3f0c1d2e-5b6a-4c7d-8e9f-0a1b2c3d4e5f',
  expiresAt: '2026-09-25T09:00:04.311Z',
  user: { username: 'north' },
};

type Route = (body: string) => { status: number; body: string; retryAfter?: number } | 'hang';

async function api(routes: Record<string, Route[]>): Promise<{ url: string; server: Server; hits: string[] }> {
  const hits: string[] = [];
  const taken: Record<string, number> = {};
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const path = req.url ?? '';
      hits.push(path);
      const list = routes[path] ?? [];
      const idx = Math.min(taken[path] ?? 0, list.length - 1);
      taken[path] = (taken[path] ?? 0) + 1;
      const out = list[idx]?.(body);
      if (!out || out === 'hang') { req.socket.destroy(); return; }
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (out.retryAfter !== undefined) headers['retry-after'] = String(out.retryAfter);
      res.writeHead(out.status, headers);
      res.end(out.body);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { url: `http://127.0.0.1:${port}`, server, hits };
}

async function statePath(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), 'zoria-')), 'state.json');
}

function windowOpen(): EtherState {
  return { ...initialEther(), phase: 'window', opensAt: 0, closesAt: 36_000_000 };
}

function instantSleep(): (ms: number) => Promise<void> {
  return () => Promise.resolve();
}

test('with no application, the registrar does nothing', async () => {
  const r = new Registrar({ api: 'http://unused', statePath: await statePath(), state: emptyState() });
  assert.equal(r.phase(), 'no-application');
  await r.onEther(windowOpen());
  assert.equal(r.phase(), 'no-application');
});

test('an application without a code is not sent even during an open window', async () => {
  const { url, server, hits } = await api({});
  try {
    const r = new Registrar({ api: url, statePath: await statePath(), state: emptyState() });
    await r.setApplication({ ...APP, invitation: '' });
    assert.equal(r.phase(), 'no-invitation');
    await r.onEther(windowOpen());
    assert.equal(hits.length, 0, 'no request is made without an invitation code');
    assert.equal(r.phase(), 'no-invitation');
  } finally { server.close(); }
});

test('a code added mid-flight immediately triggers registration during an open window', async () => {
  const { url, server, hits } = await api({
    '/auth/register': [() => ({ status: 201, body: JSON.stringify(SESSION) })],
  });
  try {
    const path = await statePath();
    const r = new Registrar({ api: url, statePath: path, state: emptyState() });
    await r.setApplication({ ...APP, invitation: '' });
    await r.onEther(windowOpen());
    assert.equal(hits.length, 0);

    await r.setInvitation('CODE-123');
    assert.equal(r.phase(), 'registered');
    assert.deepEqual(hits, ['/auth/register']);
    assert.equal((await loadState(path)).registration.token, SESSION.token);
  } finally { server.close(); }
});

test('during the noise phase the application is not sent', async () => {
  const { url, server, hits } = await api({});
  try {
    const r = new Registrar({ api: url, statePath: await statePath(), state: emptyState() });
    await r.setApplication(APP);
    await r.onEther({ ...initialEther(), phase: 'static' });
    assert.equal(hits.length, 0);
    assert.equal(r.phase(), 'listening');
  } finally { server.close(); }
});

test('429 authentication-busy is not a refusal: it waits and retries', async () => {
  const { url, server, hits } = await api({
    '/auth/register': [
      () => ({ status: 429, body: JSON.stringify({ error: { code: 'authentication-busy' } }), retryAfter: 0 }),
      () => ({ status: 201, body: JSON.stringify(SESSION) }),
    ],
  });
  try {
    const r = new Registrar({
      api: url, statePath: await statePath(), state: emptyState(), sleep: instantSleep(),
    });
    await r.setApplication(APP);
    await r.onEther(windowOpen());
    assert.equal(hits.filter((h) => h === '/auth/register').length, 2);
    assert.equal(r.phase(), 'registered');
  } finally { server.close(); }
});

test('a generic 429 on register is also not a refusal: it waits and retries', async () => {
  const { url, server, hits } = await api({
    '/auth/register': [
      () => ({ status: 429, body: JSON.stringify({ error: { code: 'rate-limited' } }), retryAfter: 0 }),
      () => ({ status: 201, body: JSON.stringify(SESSION) }),
    ],
  });
  try {
    const r = new Registrar({
      api: url, statePath: await statePath(), state: emptyState(), sleep: instantSleep(),
    });
    await r.setApplication(APP);
    await r.onEther(windowOpen());
    assert.equal(hits.filter((h) => h === '/auth/register').length, 2);
    assert.equal(r.phase(), 'registered');
  } finally { server.close(); }
});

test('a lost response logs in first and never creates a second account (CL-17)', async () => {
  const { url, server, hits } = await api({
    '/auth/register': [() => 'hang'],
    '/auth/login': [() => ({ status: 200, body: JSON.stringify(SESSION) })],
  });
  try {
    const path = await statePath();
    const r = new Registrar({ api: url, statePath: path, state: emptyState() });
    await r.setApplication(APP);
    await r.onEther(windowOpen());
    assert.deepEqual(hits, ['/auth/register', '/auth/login']);
    assert.equal(r.phase(), 'registered');
    assert.equal((await loadState(path)).registration.token, SESSION.token);
  } finally { server.close(); }
});

test('the attempt marker is written to disk before the application is sent', async () => {
  const path = await statePath();
  const { url, server } = await api({ '/auth/register': [() => 'hang'], '/auth/login': [() => 'hang'] });
  try {
    const r = new Registrar({ api: url, statePath: path, state: emptyState() });
    await r.setApplication(APP);
    await r.onEther(windowOpen());
    const saved = await loadState(path);
    assert.ok(saved.registration.attemptedAt, 'the attempt is recorded even though the connection was lost');
    assert.equal(saved.registration.token, null);
    assert.equal(r.phase(), 'lost');
  } finally { server.close(); }
});

test('after a restart with an attempt marker on disk, it logs in rather than registering again', async () => {
  const { url, server, hits } = await api({
    '/auth/login': [() => ({ status: 200, body: JSON.stringify(SESSION) })],
  });
  try {
    const prior = emptyState();
    prior.application = APP;
    prior.registration.attemptedAt = '2026-09-24T09:00:00.000Z';
    const r = new Registrar({ api: url, statePath: await statePath(), state: prior });
    assert.equal(r.phase(), 'lost');
    await r.onEther(windowOpen());
    assert.deepEqual(hits, ['/auth/login'], 'no /auth/register call after a restart with a pending attempt');
    assert.equal(r.phase(), 'registered');
  } finally { server.close(); }
});

test('409 username-unavailable also logs in first', async () => {
  const { url, server, hits } = await api({
    '/auth/register': [() => ({ status: 409, body: JSON.stringify({ error: { code: 'username-unavailable' } }) })],
    '/auth/login': [() => ({ status: 200, body: JSON.stringify(SESSION) })],
  });
  try {
    const r = new Registrar({ api: url, statePath: await statePath(), state: emptyState() });
    await r.setApplication(APP);
    await r.onEther(windowOpen());
    assert.deepEqual(hits, ['/auth/register', '/auth/login']);
    assert.equal(r.phase(), 'registered');
  } finally { server.close(); }
});

test('a 500 on register is treated like a dropped connection: it logs in instead of re-registering', async () => {
  const { url, server, hits } = await api({
    '/auth/register': [() => ({ status: 500, body: JSON.stringify({ error: { code: 'internal-error' } }) })],
    '/auth/login': [() => ({ status: 200, body: JSON.stringify(SESSION) })],
  });
  try {
    const r = new Registrar({ api: url, statePath: await statePath(), state: emptyState() });
    await r.setApplication(APP);
    await r.onEther(windowOpen());
    assert.deepEqual(hits, ['/auth/register', '/auth/login']);
    assert.equal(r.phase(), 'registered');
  } finally { server.close(); }
});

test('login 401 clears the attempt marker so a dropped registration is not stuck in lost forever', async () => {
  const { url, server, hits } = await api({
    '/auth/login': [() => ({ status: 401, body: JSON.stringify({ error: { code: 'invalid-credentials' } }) })],
    '/auth/register': [() => ({ status: 201, body: JSON.stringify(SESSION) })],
  });
  try {
    const path = await statePath();
    const prior = emptyState();
    prior.application = APP;
    prior.registration.attemptedAt = '2026-09-24T09:00:00.000Z';
    const r = new Registrar({ api: url, statePath: path, state: prior });
    assert.equal(r.phase(), 'lost');

    await r.onEther(windowOpen());
    assert.deepEqual(hits, ['/auth/login'], 'a 401 checks login before ever touching /auth/register again');
    assert.equal(r.phase(), 'listening', 'no account exists, so the machine must not stay stuck in lost');
    assert.equal((await loadState(path)).registration.attemptedAt, null);

    await r.onEther(windowOpen());
    assert.deepEqual(hits, ['/auth/login', '/auth/register']);
    assert.equal(r.phase(), 'registered');
  } finally { server.close(); }
});

test('422 invalid-invitation halts the machine and calls for a human', async () => {
  const { url, server } = await api({
    '/auth/register': [() => ({ status: 422, body: JSON.stringify({ error: { code: 'invalid-invitation', field: 'invitation' } }) })],
  });
  try {
    const r = new Registrar({ api: url, statePath: await statePath(), state: emptyState() });
    await r.setApplication(APP);
    await r.onEther(windowOpen());
    assert.equal(r.phase(), 'blocked');
    assert.match(r.blockedReason() ?? '', /invalid-invitation/);
  } finally { server.close(); }
});

test('blocked is terminal: a rejected invitation does not keep burning the rate limit', async () => {
  const { url, server, hits } = await api({
    '/auth/register': [() => ({ status: 422, body: JSON.stringify({ error: { code: 'invalid-invitation', field: 'invitation' } }) })],
  });
  try {
    const r = new Registrar({ api: url, statePath: await statePath(), state: emptyState() });
    await r.setApplication(APP);
    await r.onEther(windowOpen());
    assert.equal(r.phase(), 'blocked');

    await r.onEther(windowOpen());
    await r.onEther(windowOpen());
    assert.equal(hits.filter((h) => h === '/auth/register').length, 1, 'no further requests once blocked');
  } finally { server.close(); }
});

test('after success there are no repeat registration requests', async () => {
  const { url, server, hits } = await api({
    '/auth/register': [() => ({ status: 201, body: JSON.stringify(SESSION) })],
  });
  try {
    const r = new Registrar({ api: url, statePath: await statePath(), state: emptyState() });
    await r.setApplication(APP);
    await r.onEther(windowOpen());
    await r.onEther(windowOpen());
    await r.onEther(windowOpen());
    assert.equal(hits.filter((h) => h === '/auth/register').length, 1);
  } finally { server.close(); }
});
