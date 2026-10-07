import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Diary } from '../src/model/diary.ts';
import { focusSlot, nickOfSlot } from '../src/model/names.ts';
import type { PackSummary } from '../src/model/names.ts';

const dir = new URL('../../records/reference/', import.meta.url);
const pack = JSON.parse(readFileSync(new URL('pack.json', dir), 'utf8')) as PackSummary;
const text = readFileSync(new URL('belief-1.ndjson', dir), 'utf8');
const lines = text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as { t: number; full?: boolean; own?: Record<string, string | null>; dark?: Record<string, boolean>; foe?: [string, string, number, number][] });

function brute(t: number) {
  const own = new Map<string, string | null>();
  const dark = new Map<string, boolean>();
  for (const l of lines) {
    if (l.t > t) break;
    if (l.full) {
      own.clear();
      dark.clear();
    }
    for (const [k, v] of Object.entries(l.own ?? {})) own.set(k, v);
    for (const [k, v] of Object.entries(l.dark ?? {})) dark.set(k, v);
  }
  return { own, dark };
}

test('the focus slot and nicks follow the pack rotation and the journal roster', () => {
  assert.equal(focusSlot(pack, 1), 'A');
  assert.equal(focusSlot(pack, 2), 'B');
  assert.equal(focusSlot(pack, 3), 'C');
  assert.equal(nickOfSlot(['nazar_k', 'ihor_ts', 'oksana_fe'], 'B'), 'ihor_ts');
  assert.equal(nickOfSlot(['nazar_k', 'ihor_ts', 'oksana_fe'], 'K'), 'K');
});

test('belief at a tick equals replaying every line up to it', () => {
  const d = new Diary(text);
  for (const t of [0, 1, 2, 30, 199, 200, 201, 202, 777, 1001, 1200]) {
    const want = brute(t);
    const got = d.at(t);
    assert.deepEqual(new Map(got.own), want.own, 'own at ' + t);
    assert.deepEqual(new Map(got.dark), want.dark, 'dark at ' + t);
  }
});

test('the believed owner reads as a nick, - for nobody, ? when unknown', () => {
  const d = new Diary(text);
  const roster = ['nazar_k', 'ihor_ts', 'oksana_fe'];
  assert.equal(d.ownerAt('5,-12', 30, roster), 'nazar_k');
  assert.equal(d.ownerAt('-6,2', 30, roster), 'K');
  assert.equal(d.ownerAt('8,-9', 30, roster), '-');
  assert.equal(d.ownerAt('99,99', 30, roster), '?');
  assert.equal(d.ownerAt('5,-12', 0, roster), '?');
});

test('a ghost is the last contact up to the tick, with its age', () => {
  const d = new Diary(text);
  assert.deepEqual(d.ghost('K-1', 12), { cell: '5,-5', age: 0 });
  assert.deepEqual(d.ghost('K-1', 20), { cell: d.ghost('K-1', 20)?.cell, age: 20 - (d.lastContact('K-1', 20) ?? 0) });
  assert.equal(d.ghost('K-1', 11), null);
  assert.equal(d.ghost('Z-99', 600), null);
  const contact = lines.find((l) => (l.foe ?? []).some((f) => f[0] === 'K-1'));
  assert.equal(contact?.t, 12);
});

test('silent needles are counted only among the manifest needles', () => {
  const d = new Diary(text);
  for (const t of [30, 500, 1100]) {
    const dark = brute(t).dark;
    const keys = [...dark.keys()].slice(0, 5);
    assert.equal(d.darkCount(t, keys), keys.filter((k) => dark.get(k) === true).length);
  }
  assert.equal(d.darkCount(30, []), 0);
});
