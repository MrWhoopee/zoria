import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { accountRoute, startLocalApi, type AccountHandlers } from '../../src/agent/local-api.ts';
import { initialEther } from '../../src/protocol/ether.ts';
import type { Application } from '../../src/agent/store.ts';

const APP: Application = {
  username: 'north', displayName: 'Northern Watch', password: 'correct-horse-battery',
  invitation: '', repositoryUrl: 'north/zoria-client', lang: 'uk',
};

function snapshot() {
  return {
    ether: initialEther(), registrar: 'listening' as const,
    blockedReason: null, serverNow: 1000, msUntilOpen: null,
  };
}

test('GET /state returns the snapshot', async () => {
  const api = await startLocalApi({
    port: 0, snapshot, onApplication: async () => {}, onInvitation: async () => {},
  });
  try {
    const res = await fetch(`http://127.0.0.1:${api.port}/state`);
    const body = await res.json() as ReturnType<typeof snapshot>;
    assert.equal(res.status, 200);
    assert.equal(body.registrar, 'listening');
  } finally { await api.close(); }
});

test('POST /application accepts the application', async () => {
  let got: Application | null = null;
  const api = await startLocalApi({
    port: 0, snapshot,
    onApplication: async (a) => { got = a; },
    onInvitation: async () => {},
  });
  try {
    const res = await fetch(`http://127.0.0.1:${api.port}/application`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(APP),
    });
    assert.equal(res.status, 204);
    assert.deepEqual(got, APP);
  } finally { await api.close(); }
});

test('POST /application rejects a username that does not match the pattern', async () => {
  let got: Application | null = null;
  const api = await startLocalApi({
    port: 0, snapshot,
    onApplication: async (a) => { got = a; },
    onInvitation: async () => {},
  });
  try {
    const res = await fetch(`http://127.0.0.1:${api.port}/application`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...APP, username: 'North_Watch' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as { field: string };
    assert.equal(body.field, 'username');
    assert.equal(got, null, 'a bad username never reaches the registrar');
  } finally { await api.close(); }
});

test('POST /application rejects a repositoryUrl that points inside a repository, not at its root', async () => {
  let got: Application | null = null;
  const api = await startLocalApi({
    port: 0, snapshot,
    onApplication: async (a) => { got = a; },
    onInvitation: async () => {},
  });
  try {
    const res = await fetch(`http://127.0.0.1:${api.port}/application`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...APP, repositoryUrl: 'https://github.com/north/zoria-client/blob/main/README.md' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as { field: string };
    assert.equal(body.field, 'repositoryUrl');
    assert.equal(got, null, 'a repository path never reaches the registrar');
  } finally { await api.close(); }
});

test('POST /application accepts a full URL to the repository root', async () => {
  let got: Application | null = null;
  const api = await startLocalApi({
    port: 0, snapshot,
    onApplication: async (a) => { got = a; },
    onInvitation: async () => {},
  });
  try {
    const res = await fetch(`http://127.0.0.1:${api.port}/application`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...APP, repositoryUrl: 'https://github.com/north/zoria-client' }),
    });
    assert.equal(res.status, 204);
    assert.equal((got as Application | null)?.repositoryUrl, 'https://github.com/north/zoria-client');
  } finally { await api.close(); }
});

test('POST /application rejects a displayName with leading or trailing whitespace', async () => {
  const api = await startLocalApi({
    port: 0, snapshot, onApplication: async () => {}, onInvitation: async () => {},
  });
  try {
    const res = await fetch(`http://127.0.0.1:${api.port}/application`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...APP, displayName: ' Northern Watch ' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as { field: string };
    assert.equal(body.field, 'displayName');
  } finally { await api.close(); }
});

test('POST /application rejects a password shorter than 12 characters', async () => {
  const api = await startLocalApi({
    port: 0, snapshot, onApplication: async () => {}, onInvitation: async () => {},
  });
  try {
    const res = await fetch(`http://127.0.0.1:${api.port}/application`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...APP, password: 'short-pass' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as { field: string };
    assert.equal(body.field, 'password');
  } finally { await api.close(); }
});

test('POST /invitation delivers the code on the fly', async () => {
  let code: string | null = null;
  const api = await startLocalApi({
    port: 0, snapshot, onApplication: async () => {},
    onInvitation: async (c) => { code = c; },
  });
  try {
    const res = await fetch(`http://127.0.0.1:${api.port}/invitation`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ invitation: 'CODE-123' }),
    });
    assert.equal(res.status, 204);
    assert.equal(code, 'CODE-123');
  } finally { await api.close(); }
});

test('a malformed body does not bring the agent down', async () => {
  const api = await startLocalApi({
    port: 0, snapshot, onApplication: async () => {}, onInvitation: async () => {},
  });
  try {
    const res = await fetch(`http://127.0.0.1:${api.port}/invitation`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json',
    });
    assert.equal(res.status, 400);
    const still = await fetch(`http://127.0.0.1:${api.port}/state`);
    assert.equal(still.status, 200);
  } finally { await api.close(); }
});

test('an empty invitation is rejected and never reaches the agent', async () => {
  let code: string | null = null;
  const api = await startLocalApi({
    port: 0, snapshot, onApplication: async () => {},
    onInvitation: async (c) => { code = c; },
  });
  try {
    const res = await fetch(`http://127.0.0.1:${api.port}/invitation`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ invitation: '' }),
    });
    assert.equal(res.status, 400);
    assert.equal(code, null);
  } finally { await api.close(); }
});

test('GET /events returns a stream of events', async () => {
  const api = await startLocalApi({
    port: 0, snapshot, onApplication: async () => {}, onInvitation: async () => {},
  });
  try {
    const res = await fetch(`http://127.0.0.1:${api.port}/events`);
    assert.equal(res.headers.get('content-type'), 'text/event-stream');
    const reader = res.body?.getReader();
    const chunk = await reader?.read();
    const text = new TextDecoder().decode(chunk?.value);
    assert.match(text, /^data: /m);
    await reader?.cancel();
  } finally { await api.close(); }
});

function raw(port: number, path: string, method: string, headers: Record<string, string>, body = ''): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('a cross-site text/plain POST cannot replace the application', async () => {
  let called = false;
  const api = await startLocalApi({
    port: 0, snapshot,
    onApplication: async () => { called = true; },
    onInvitation: async () => { called = true; },
  });
  try {
    const status = await raw(api.port, '/application', 'POST', { 'content-type': 'text/plain' }, JSON.stringify(APP));
    assert.equal(status, 415);
    const inv = await raw(api.port, '/invitation', 'POST', { 'content-type': 'text/plain' }, JSON.stringify({ invitation: 'x' }));
    assert.equal(inv, 415);
    assert.equal(called, false);
  } finally { await api.close(); }
});

test('a request for a foreign host name is refused, so DNS rebinding cannot reach the api', async () => {
  let called = false;
  const api = await startLocalApi({
    port: 0, snapshot,
    onApplication: async () => { called = true; },
    onInvitation: async () => {},
  });
  try {
    const post = await raw(api.port, '/application', 'POST',
      { 'content-type': 'application/json', host: `evil.example:${api.port}` }, JSON.stringify(APP));
    assert.equal(post, 403);
    assert.equal(await raw(api.port, '/state', 'GET', { host: 'evil.example' }), 403);
    assert.equal(await raw(api.port, '/state', 'GET', { host: `localhost:${api.port}` }), 200);
    assert.equal(called, false);
  } finally { await api.close(); }
});

const SID = '00000000-0000-4000-8000-0000000000aa';

function handlers(over: Partial<AccountHandlers> = {}): AccountHandlers {
  return {
    stage: (id) => (id === SID ? { id: SID, body: '# Part two' } : null),
    ack: async () => ({ ok: true, stage: { id: SID } }),
    read: async () => ({ ok: false, status: 503, code: 'stopping', requestId: 'r-1', retryAfter: 30 }),
    login: async () => ({ ok: true }),
    logout: async () => ({ ok: true }),
    roll: async () => ({ ok: true, entries: [] }),
    ...over,
  };
}

test('account routes are recognised only with safe ids', () => {
  assert.deepEqual(accountRoute('GET', `/account/stages/${SID}`), { kind: 'stage', id: SID });
  assert.deepEqual(accountRoute('POST', `/account/stages/${SID}/ack`), { kind: 'ack', id: SID });
  assert.deepEqual(accountRoute('POST', `/account/inbox/${SID}/read`), { kind: 'read', id: SID });
  assert.deepEqual(accountRoute('POST', '/account/login'), { kind: 'login' });
  assert.deepEqual(accountRoute('POST', '/account/logout'), { kind: 'logout' });
  assert.deepEqual(accountRoute('POST', '/account/roll'), { kind: 'roll' });
  assert.equal(accountRoute('GET', '/account/stages/..%2Fme'), null);
  assert.equal(accountRoute('GET', '/account/stages/a/b'), null);
  assert.equal(accountRoute('GET', '/account/login'), null);
});

test('GET /account/stages/:id returns the full text or 404', async () => {
  const api = await startLocalApi({ port: 0, snapshot, onApplication: async () => {}, onInvitation: async () => {}, account: handlers() });
  try {
    const hit = await fetch(`http://127.0.0.1:${api.port}/account/stages/${SID}`);
    assert.equal(hit.status, 200);
    assert.equal(((await hit.json()) as { stage: { body: string } }).stage.body, '# Part two');
    const miss = await fetch(`http://127.0.0.1:${api.port}/account/stages/00000000-0000-4000-8000-000000000000`);
    assert.equal(miss.status, 404);
  } finally { await api.close(); }
});

test('account actions answer 200 with the outcome, failures included', async () => {
  const api = await startLocalApi({ port: 0, snapshot, onApplication: async () => {}, onInvitation: async () => {}, account: handlers() });
  try {
    const post = (path: string) => fetch(`http://127.0.0.1:${api.port}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    const ack = await post(`/account/stages/${SID}/ack`);
    assert.equal(ack.status, 200);
    assert.equal(((await ack.json()) as { ok: boolean }).ok, true);
    const read = await post(`/account/inbox/${SID}/read`);
    assert.deepEqual(await read.json(), { ok: false, status: 503, code: 'stopping', requestId: 'r-1', retryAfter: 30 });
  } finally { await api.close(); }
});

test('a request body over the limit is refused', async () => {
  const api = await startLocalApi({ port: 0, snapshot, onApplication: async () => {}, onInvitation: async () => {} });
  try {
    const res = await fetch(`http://127.0.0.1:${api.port}/invitation`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ invitation: 'x'.repeat(70_000) }),
    });
    assert.equal(res.status, 400);
  } finally { await api.close(); }
});
