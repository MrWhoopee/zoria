import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { contentTypeFor, resolveClientPath } from '../../src/agent/static-files.ts';
import { startLocalApi } from '../../src/agent/local-api.ts';
import { initialEther } from '../../src/protocol/ether.ts';

async function clientDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'zoria-client-'));
  await mkdir(join(dir, 'assets'));
  await writeFile(join(dir, 'index.html'), '<div id="root"></div>');
  await writeFile(join(dir, 'assets', 'app.js'), 'console.log(1)');
  return dir;
}

function startApi(dir?: string) {
  return startLocalApi({
    port: 0,
    clientDir: dir,
    snapshot: () => ({ ether: initialEther(), registrar: 'listening', blockedReason: null, serverNow: null, msUntilOpen: null }),
    onApplication: async () => {},
    onInvitation: async () => {},
  });
}

function rawGet(port: number, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}

test('the root path resolves to index.html inside the client directory', () => {
  const p = resolveClientPath('/srv/client', '/');
  assert.ok(p !== null && p.endsWith(`${sep}index.html`));
});

test('a query string is ignored when resolving a file', () => {
  const p = resolveClientPath('/srv/client', '/assets/app.js?v=3');
  assert.ok(p !== null && p.endsWith(`app.js`));
});

test('paths that escape the client directory are refused', () => {
  for (const path of ['/%2e%2e/package.json', '/..%2fpackage.json', '/..%5cpackage.json', '/assets/%2e%2e/%2e%2e/secret']) {
    assert.equal(resolveClientPath('/srv/client', path), null, path);
  }
});

test('a null byte or a malformed escape is refused', () => {
  assert.equal(resolveClientPath('/srv/client', '/index.html%00.js'), null);
  assert.equal(resolveClientPath('/srv/client', '/%E0%A4%A'), null);
});

test('content types follow the extension', () => {
  assert.equal(contentTypeFor('a.html'), 'text/html; charset=utf-8');
  assert.equal(contentTypeFor('a.js'), 'text/javascript; charset=utf-8');
  assert.equal(contentTypeFor('a.webp'), 'image/webp');
  assert.equal(contentTypeFor('a.ogg'), 'audio/ogg');
  assert.equal(contentTypeFor('a.unknown'), 'application/octet-stream');
});

test('the local API serves the built client from its own port', async () => {
  const api = await startApi(await clientDir());
  try {
    const page = await fetch(`http://127.0.0.1:${api.port}/`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(await page.text(), '<div id="root"></div>');
    const script = await fetch(`http://127.0.0.1:${api.port}/assets/app.js`);
    assert.equal(script.headers.get('content-type'), 'text/javascript; charset=utf-8');
  } finally {
    await api.close();
  }
});

test('API routes still answer while the client is being served', async () => {
  const api = await startApi(await clientDir());
  try {
    const state = await fetch(`http://127.0.0.1:${api.port}/state`);
    assert.equal(state.headers.get('content-type'), 'application/json');
  } finally {
    await api.close();
  }
});

test('a traversal attempt and a missing file both get 404', async () => {
  const api = await startApi(await clientDir());
  try {
    assert.equal(await rawGet(api.port, '/%2e%2e/package.json'), 404);
    assert.equal(await rawGet(api.port, '/missing.js'), 404);
  } finally {
    await api.close();
  }
});

test('without a client directory the root is a plain 404', async () => {
  const api = await startApi();
  try {
    assert.equal(await rawGet(api.port, '/'), 404);
  } finally {
    await api.close();
  }
});
