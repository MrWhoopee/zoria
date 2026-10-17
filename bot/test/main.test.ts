import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { ENGINE_HASH } from '@zoria/engine';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const BASE_ENV: Record<string, string> = { PATH: process.env['PATH'] ?? '', SYSTEMROOT: process.env['SYSTEMROOT'] ?? '' };

function freePort(): Promise<number> {
  return new Promise((ok) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as AddressInfo).port;
      s.close(() => ok(port));
    });
  });
}

function start(env: Record<string, string>): { child: ChildProcess; out: () => string; exited: Promise<number | null> } {
  const child = spawn(process.execPath, [MAIN], { env: { ...BASE_ENV, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let text = '';
  child.stdout?.on('data', (c: Buffer) => {
    text += c.toString('utf8');
  });
  const exited = new Promise<number | null>((ok) => child.on('exit', (code) => ok(code)));
  return { child, out: () => text, exited };
}

async function until(check: () => boolean, ms = 15000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((ok) => setTimeout(ok, 50));
  }
}

async function lobby(env: Record<string, string> = {}): Promise<{ url: string; out: () => string; stop: () => Promise<void> }> {
  const port = await freePort();
  const p = start({ STATUS_PORT: String(port), STATUS_HOST: '127.0.0.1', ...env });
  await until(() => p.out().includes('службовий порт ' + port));
  return {
    url: 'http://127.0.0.1:' + port,
    out: p.out,
    stop: async () => {
      p.child.kill();
      await p.exited;
    },
  };
}

const post = (url: string, preset: unknown): Promise<Response> => fetch(url + '/preset', { method: 'POST', body: JSON.stringify({ preset }) });

test('without a node and without a status port the bot explains and exits 2', async () => {
  const p = start({});
  assert.equal(await p.exited, 2);
  assert.match(p.out(), /потрібні ZARIA_URL і ZARIA_TOKEN/);
});

test('in the lobby the status port shows глушій-7 and an idle head', async () => {
  const b = await lobby();
  try {
    const r = await fetch(b.url + '/state');
    assert.equal(r.status, 200);
    const s = (await r.json()) as Record<string, unknown>;
    assert.equal(s['state'], 'lobby');
    assert.equal(s['slot'], null);
    assert.equal(s['preset'], 'глушій-7');
    assert.equal(s['freeze'], false);
    assert.equal(s['tick'], 0);
    assert.equal(s['frames'], 0);
    assert.equal(s['ticks'], 0);
    assert.equal(s['engine'], ENGINE_HASH);
    assert.match(String(s['why']), /потрібні ZARIA_URL і ZARIA_TOKEN/);
    assert.ok((s['presets'] as string[]).includes('глушій-5'));
    assert.ok(Number(s['uptimeMs']) >= 0);
    assert.deepEqual(s['stats'], { ticks: 0, orders: 0, nacks: 0, bytesIn: 0, bytesOut: 0, resyncMs: 0, resumes: 0, faults: 0, deferred: 0, lastTickAt: 0 });
    assert.deepEqual(s['belief'], { frames: 0, ageMs: 0 });
  } finally {
    await b.stop();
  }
});

test('the lobby promotes a known preset and refuses an unknown one', async () => {
  const b = await lobby();
  try {
    const ok = await post(b.url, 'глушій-5');
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { preset: 'глушій-5' });
    const s = (await (await fetch(b.url + '/state')).json()) as Record<string, unknown>;
    assert.equal(s['preset'], 'глушій-5');
    for (const bad of ['немає-такого', 7, null]) {
      const r = await post(b.url, bad);
      assert.equal(r.status, 400, String(bad));
      assert.deepEqual(await r.json(), { error: 'preset' });
    }
  } finally {
    await b.stop();
  }
});

test('ZARIA_PRESET picks the starting preset and ZARIA_FREEZE forbids promotion', async () => {
  const b = await lobby({ ZARIA_PRESET: 'глушій-5', ZARIA_FREEZE: '1' });
  try {
    const s = (await (await fetch(b.url + '/state')).json()) as Record<string, unknown>;
    assert.equal(s['preset'], 'глушій-5');
    assert.equal(s['freeze'], true);
    const r = await post(b.url, 'глушій-7');
    assert.equal(r.status, 409);
    assert.deepEqual(await r.json(), { error: 'freeze' });
  } finally {
    await b.stop();
  }
});
