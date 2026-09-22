import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyState, loadState, saveState } from '../../src/agent/store.ts';

async function tmpFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'zoria-'));
  return join(dir, 'state.json');
}

test('missing file returns empty state, not exception', async () => {
  const s = await loadState(await tmpFile());
  assert.deepEqual(s, emptyState());
});

test('corrupted file returns empty state, not exception', async () => {
  const path = await tmpFile();
  await writeFile(path, '{ this is not json');
  assert.deepEqual(await loadState(path), emptyState());
});

test('state survives write and read', async () => {
  const path = await tmpFile();
  const s = emptyState();
  s.application = {
    username: 'north',
    displayName: 'Northern Watch',
    password: 'correct-horse-battery',
    invitation: 'CODE-123',
    repositoryUrl: 'north/zoria-client',
    lang: 'uk',
  };
  s.registration.attemptedAt = '2026-09-24T09:00:00.000Z';
  await saveState(path, s);
  assert.deepEqual(await loadState(path), s);
});

test('write is atomic: no temporary files remain', async () => {
  const path = await tmpFile();
  await saveState(path, emptyState());
  await saveState(path, emptyState());
  const files = await readdir(join(path, '..'));
  assert.deepEqual(files, ['state.json']);
});

test('file is readable as JSON and contains indentation', async () => {
  const path = await tmpFile();
  await saveState(path, emptyState());
  const text = await readFile(path, 'utf8');
  assert.ok(text.includes('\n'), 'state should be human-readable');
  assert.doesNotThrow(() => JSON.parse(text));
});
