import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TruthQueue } from '../src/model/queue.ts';
import type { FromTruth } from '../src/model/queue.ts';

const bytes = (n: number): ArrayBuffer => {
  const b = readFileSync(new URL('../../records/reference/match-' + n + '.runlog', import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

function harness() {
  const out: FromTruth[] = [];
  const jobs: (() => void)[] = [];
  const q = new TruthQueue((m) => out.push(m), (fn) => jobs.push(fn));
  const drain = (): void => {
    while (jobs.length > 0) jobs.shift()?.();
  };
  return { q, out, drain };
}

test('open answers with the match length and at answers with the truth', () => {
  const h = harness();
  h.q.handle({ kind: 'open', match: 1, bytes: bytes(1) });
  h.drain();
  const opened = h.out[0];
  assert.equal(opened?.kind, 'opened');
  assert.equal(opened?.kind === 'opened' && opened.ticks, 1200);
  assert.ok(opened?.kind === 'opened' && opened.land.length > 100);
  h.q.handle({ kind: 'at', match: 1, t: 100, id: 7 });
  h.drain();
  const r = h.out.at(-1);
  assert.equal(r?.kind, 'truth');
  if (r?.kind === 'truth') {
    assert.equal(r.id, 7);
    assert.equal(r.at.t, 100);
  }
});

test('only the latest request per match is answered when several wait', () => {
  const h = harness();
  h.q.handle({ kind: 'open', match: 2, bytes: bytes(2) });
  h.q.handle({ kind: 'at', match: 2, t: 100, id: 1 });
  h.q.handle({ kind: 'at', match: 2, t: 900, id: 2 });
  h.q.handle({ kind: 'at', match: 2, t: 500, id: 3 });
  h.drain();
  const answers = h.out.filter((m) => m.kind === 'truth');
  assert.deepEqual(answers.map((m) => (m.kind === 'truth' ? m.id : 0)), [3]);
});

test('a request for a match not opened is reported, not thrown', () => {
  const h = harness();
  h.q.handle({ kind: 'at', match: 3, t: 10, id: 9 });
  h.drain();
  assert.deepEqual(h.out, [{ kind: 'missing', match: 3, id: 9 }]);
});
