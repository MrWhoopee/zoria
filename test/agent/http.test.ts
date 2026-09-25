import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { fetchRaw } from '../../src/agent/http.ts';
import { loadConfig } from '../../src/agent/config.ts';

function listen(handler: Parameters<typeof createServer>[1]): Promise<{ url: string; server: Server }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ url: `http://127.0.0.1:${port}`, server });
    });
  });
}

test('returns raw body, status and Retry-After', async () => {
  const { url, server } = await listen((_req, res) => {
    res.writeHead(503, { 'content-type': 'application/json', 'retry-after': '30' });
    res.end('{"error":{"code":"stopping"}}');
  });
  try {
    const r = await fetchRaw(`${url}/ether`, {}, 5000, () => 42);
    assert.ok(!('failed' in r));
    if ('failed' in r) return;
    assert.equal(r.status, 503);
    assert.equal(r.retryAfterSeconds, 30);
    assert.equal(r.body, '{"error":{"code":"stopping"}}');
    assert.equal(r.receivedAt, 42);
  } finally {
    server.close();
  }
});

test('body is not parsed — HTML returns as-is', async () => {
  const { url, server } = await listen((_req, res) => {
    res.writeHead(418, { 'content-type': 'text/html' });
    res.end('<html>teapot</html>');
  });
  try {
    const r = await fetchRaw(`${url}/ether`, {}, 5000, () => 0);
    assert.ok(!('failed' in r));
    if ('failed' in r) return;
    assert.equal(r.body, '<html>teapot</html>');
    assert.equal(r.retryAfterSeconds, null);
  } finally {
    server.close();
  }
});

test('connection aborted — network, no exception', async () => {
  const { url, server } = await listen((_req, res) => {
    res.socket?.destroy();
  });
  try {
    const r = await fetchRaw(`${url}/ether`, {}, 5000, () => 7);
    assert.deepEqual(r, { failed: 'network', receivedAt: 7 });
  } finally {
    server.close();
  }
});

test('timeout does not hang agent', async () => {
  const { url, server } = await listen(() => { });
  try {
    const r = await fetchRaw(`${url}/ether`, {}, 120, () => 9);
    assert.deepEqual(r, { failed: 'timeout', receivedAt: 9 });
  } finally {
    server.close();
  }
});

test('non-numeric Retry-After returns null', async () => {
  const { url, server } = await listen((_req, res) => {
    res.writeHead(429, { 'retry-after': 'soon' });
    res.end('');
  });
  try {
    const r = await fetchRaw(`${url}/ether`, {}, 5000, () => 11);
    assert.ok(!('failed' in r));
    if ('failed' in r) return;
    assert.equal(r.retryAfterSeconds, null);
  } finally {
    server.close();
  }
});

test('negative Retry-After returns null', async () => {
  const { url, server } = await listen((_req, res) => {
    res.writeHead(429, { 'retry-after': '-5' });
    res.end('');
  });
  try {
    const r = await fetchRaw(`${url}/ether`, {}, 5000, () => 12);
    assert.ok(!('failed' in r));
    if ('failed' in r) return;
    assert.equal(r.retryAfterSeconds, null);
  } finally {
    server.close();
  }
});

test('config strips trailing slash and reads stand from env', () => {
  const c = loadConfig({ ZORIA_API: 'https://stand.zoria.net/api/v1/' } as NodeJS.ProcessEnv);
  assert.equal(c.api, 'https://stand.zoria.net/api/v1');
  assert.equal(c.etherIntervalMs, 15_000);
});

test('keeps the X-Request-Id header for failure reports', async () => {
  const { url, server } = await listen((_req, res) => {
    res.writeHead(500, { 'content-type': 'application/json', 'x-request-id': 'req-42' });
    res.end('{"error":{"code":"internal-error","requestId":"req-42"}}');
  });
  try {
    const r = await fetchRaw(`${url}/me/summary`, {}, 5000);
    assert.ok(!('failed' in r));
    if ('failed' in r) return;
    assert.equal(r.requestId, 'req-42');
  } finally { server.close(); }
});
