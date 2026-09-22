import test from 'node:test';
import assert from 'node:assert/strict';
import { startLocalApi } from '../../src/agent/local-api.ts';
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
