import test from 'node:test';
import assert from 'node:assert/strict';
import { roll } from '../../src/client/agent/actions.ts';

async function withFetch(fake: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = fake;
  try { await run(); } finally { globalThis.fetch = original; }
}

test('a reply that is not JSON is a bad reply, not an offline agent', async () => {
  await withFetch(async () => new Response('<html>'), async () => {
    const r = await roll(new AbortController().signal);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'bad-reply');
  });
});

test('no connection to the agent is an offline agent', async () => {
  await withFetch(async () => { throw new TypeError('fetch failed'); }, async () => {
    const r = await roll(new AbortController().signal);
    if (!r.ok) assert.equal(r.code, 'agent-offline');
  });
});

test('a request cancelled by the screen is reported as cancelled', async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  await withFetch(async () => { throw new DOMException('aborted', 'AbortError'); }, async () => {
    const r = await roll(ctrl.signal);
    if (!r.ok) assert.equal(r.code, 'cancelled');
  });
});
