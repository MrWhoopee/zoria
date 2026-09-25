import test from 'node:test';
import assert from 'node:assert/strict';
import { letterScreen } from '../../src/client/terminal/letter.ts';
import { wrap } from '../../src/client/text/wrap.ts';
import { parseCommand, helpLines } from '../../src/client/terminal/commands.ts';
import { COLS } from '../../src/client/terminal/grid.ts';

test('wrapping breaks between words and never splits a character', () => {
  assert.deepEqual(wrap('the word costs', 8), ['the word', 'costs']);
  assert.deepEqual(wrap('Слово коштує дорого', 12), ['Слово коштує', 'дорого']);
  assert.deepEqual(wrap('abcdefghij', 4), ['abcd', 'efgh', 'ij']);
  assert.deepEqual(wrap('', 10), ['']);
});

test('the letter is read in fragment order with gaps marked', () => {
  const lines = letterScreen({ fragments: { 3: 'third', 1: 'first' }, fragmentsOf: 3, archive: [] }, 1);
  assert.equal(lines[0], 'LETTER   2/3   PAGE 1/1');
  assert.deepEqual(lines.slice(1, 4), ['01 first', '02 ...', '03 third']);
});

test('a long letter is split into pages that fit the screen', () => {
  const fragments = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, `fragment ${i + 1}`]));
  const first = letterScreen({ fragments, fragmentsOf: 20, archive: [] }, 1);
  const last = letterScreen({ fragments, fragmentsOf: 20, archive: [] }, 3);
  assert.equal(first[0], 'LETTER   20/20   PAGE 1/3');
  assert.ok(first.length <= 10);
  assert.equal(first.at(-1), 'type LETTER 2');
  assert.equal(last[1], '17 fragment 17');
  for (const l of [...first, ...last]) assert.ok(Array.from(l).length <= COLS, l);
});

test('a fragment is never split across two pages', () => {
  const long = 'word '.repeat(20).trim();
  const fragments: Record<number, string> = { 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'e', 6: 'f', 7: 'g', 8: long };
  const first = letterScreen({ fragments, fragmentsOf: 8, archive: [] }, 1);
  const second = letterScreen({ fragments, fragmentsOf: 8, archive: [] }, 2);
  assert.ok(!first.some((l) => l.startsWith('08 ')));
  assert.ok(second[1].startsWith('08 word'));
  assert.ok(second[2].startsWith('   word'));
});

test('a page past the end shows the last page', () => {
  const lines = letterScreen({ fragments: { 1: 'only' }, fragmentsOf: 1, archive: [] }, 9);
  assert.equal(lines[0], 'LETTER   1/1   PAGE 1/1');
});

test('before any fragment the screen says so', () => {
  const lines = letterScreen({ fragments: {}, fragmentsOf: null, archive: [] }, 1);
  assert.equal(lines[0], 'LETTER   NONE YET');
});

test('earlier letters are mentioned on the last page', () => {
  const lines = letterScreen({ fragments: { 1: 'new' }, fragmentsOf: 1, archive: [{ of: 12, fragments: { 1: 'old' } }] }, 1);
  assert.equal(lines.at(-1), 'EARLIER LETTERS KEPT: 1');
});

test('LETTER takes an optional page number', () => {
  assert.deepEqual(parseCommand('letter'), { kind: 'letter', page: 1 });
  assert.deepEqual(parseCommand('LETTER 3'), { kind: 'letter', page: 3 });
  assert.deepEqual(parseCommand('letter x'), { kind: 'letter', page: 1 });
  assert.ok(helpLines().some((l) => l.startsWith('LETTER')));
});
