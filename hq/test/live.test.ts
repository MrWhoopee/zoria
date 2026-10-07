import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readRunLog } from '@zoria/protocol';
import { LiveFollower } from '../src/model/live.ts';
import { Truth } from '../src/model/truth.ts';

const bytes = new Uint8Array(readFileSync(new URL('../../records/reference/match-2.runlog', import.meta.url)));

test('a live match fed tick by tick reaches the same score as the journal', () => {
  const log = readRunLog(bytes);
  const live = new LiveFollower();
  live.start({ manifest: log.manifest, bots: log.bots, roster: log.roster, ticks: 1200, seat: 1 });
  const byTick = new Map<number, [string, Uint8Array][]>();
  for (const [t, slot, frame] of log.submits) byTick.set(t, [...(byTick.get(t) ?? []), [slot, frame]]);
  const truth = new Truth(bytes);
  let at = live.tick({ t: 0, submits: [], denies: [] });
  for (let t = 1; t <= 300; t++) at = live.tick({ t, submits: byTick.get(t) ?? [], denies: [] });
  assert.equal(at.t, 300);
  assert.equal(live.slot, 'B');
  assert.equal(at.score, truth.at(300).score['B']);
});

test('ticks before a start are ignored and the end keeps the shares', () => {
  const live = new LiveFollower();
  assert.equal(live.tick({ t: 5, submits: [], denies: [] }).score, null);
  live.end([3, 2, 1]);
  assert.deepEqual(live.shares, [3, 2, 1]);
});
