import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { Refusal, statusServer } from '../src/status.ts';
import type { Head, HeadState } from '../src/status.ts';

const STATE = { state: 'lobby', slot: null, preset: 'глушій-7', tick: 0 } as unknown as HeadState;

async function serve(head: Head): Promise<{ url: string; close: () => Promise<void> }> {
  const server = statusServer(head);
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as AddressInfo).port;
  return { url: 'http://127.0.0.1:' + port, close: () => new Promise((ok) => server.close(() => ok())) };
}

function fakeHead(promote: (v: unknown) => string = (v) => String(v)): Head & { asked: unknown[] } {
  const asked: unknown[] = [];
  return {
    asked,
    state: () => STATE,
    promote: (v) => {
      asked.push(v);
      return promote(v);
    },
  };
}

test('GET /state answers the head state as json, query string ignored', async () => {
  const s = await serve(fakeHead());
  try {
    const r = await fetch(s.url + '/state?x=1');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /^application\/json/);
    const text = await r.text();
    assert.equal(Number(r.headers.get('content-length')), Buffer.byteLength(text));
    assert.deepEqual(JSON.parse(text), STATE);
  } finally {
    await s.close();
  }
});

test('POST /preset promotes the named preset and answers it', async () => {
  const head = fakeHead((v) => 'set:' + String(v));
  const s = await serve(head);
  try {
    const r = await fetch(s.url + '/preset', { method: 'POST', body: JSON.stringify({ preset: 'глушій-5' }) });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { preset: 'set:глушій-5' });
    assert.deepEqual(head.asked, ['глушій-5']);
  } finally {
    await s.close();
  }
});

test('an empty POST body reads as an empty object', async () => {
  const head = fakeHead();
  const s = await serve(head);
  try {
    const r = await fetch(s.url + '/preset', { method: 'POST' });
    assert.equal(r.status, 200);
    assert.deepEqual(head.asked, [undefined]);
  } finally {
    await s.close();
  }
});

test('a refusal from the head keeps its code and word', async () => {
  const s = await serve(
    fakeHead(() => {
      throw new Refusal(409, 'live');
    }),
  );
  try {
    const r = await fetch(s.url + '/preset', { method: 'POST', body: '{"preset":"x"}' });
    assert.equal(r.status, 409);
    assert.deepEqual(await r.json(), { error: 'live' });
  } finally {
    await s.close();
  }
});

test('any other error is a 500 with its message', async () => {
  const s = await serve(
    fakeHead(() => {
      throw new Error('boom');
    }),
  );
  try {
    const r = await fetch(s.url + '/preset', { method: 'POST', body: '{}' });
    assert.equal(r.status, 500);
    assert.deepEqual(await r.json(), { error: 'boom' });
  } finally {
    await s.close();
  }
});

test('bad json, a json array and a body over 1024 bytes are refused with 400', async () => {
  const head = fakeHead();
  const s = await serve(head);
  try {
    for (const body of ['{oops', '[1,2]', 'null', '"text"']) {
      const r = await fetch(s.url + '/preset', { method: 'POST', body });
      assert.equal(r.status, 400, body);
      assert.deepEqual(await r.json(), { error: 'json' });
    }
    const big = await fetch(s.url + '/preset', { method: 'POST', body: JSON.stringify({ preset: 'x'.repeat(1100) }) }).catch(() => null);
    if (big) assert.equal(big.status, 400);
    const edge = await fetch(s.url + '/preset', { method: 'POST', body: JSON.stringify({ preset: 'y'.repeat(1024 - 13) }) });
    assert.equal(edge.status, 200);
    assert.equal(head.asked.length, 1);
  } finally {
    await s.close();
  }
});

test('unknown paths and methods are 404', async () => {
  const s = await serve(fakeHead());
  try {
    for (const [method, path] of [['GET', '/nope'], ['POST', '/state'], ['GET', '/preset']] as const) {
      const r = await fetch(s.url + path, { method });
      assert.equal(r.status, 404, method + ' ' + path);
      assert.deepEqual(await r.json(), { error: 'path' });
    }
  } finally {
    await s.close();
  }
});

test('Refusal carries its code, word and name', () => {
  const e = new Refusal(400, 'preset');
  assert.equal(e.code, 400);
  assert.equal(e.message, 'preset');
  assert.equal(e.name, 'Refusal');
  assert.ok(e instanceof Error);
});
