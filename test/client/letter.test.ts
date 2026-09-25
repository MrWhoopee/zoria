import test from 'node:test';
import assert from 'node:assert/strict';
import { letterLines } from '../../src/client/terminal/letter.ts';
import { wrap } from '../../src/client/text/wrap.ts';
import { parseCommand } from '../../src/client/terminal/commands.ts';
import { COLS } from '../../src/client/terminal/grid.ts';

test('wrapping breaks between words and never splits a character', () => {
  assert.deepEqual(wrap('the word costs', 8), ['the word', 'costs']);
  assert.deepEqual(wrap('Слово коштує дорого', 12), ['Слово коштує', 'дорого']);
  assert.deepEqual(wrap('abcdefghij', 4), ['abcd', 'efgh', 'ij']);
  assert.deepEqual(wrap('', 10), ['']);
});

test('the letter reads in fragment order with gaps marked, as one scrollable text', () => {
  const lines = letterLines({ fragments: { 1: 'first', 3: 'third' }, fragmentsOf: 3, archive: [] });
  assert.deepEqual(lines, ['01 first', '02 ...', '03 third']);
});

test('before any fragment the letter says so', () => {
  assert.deepEqual(letterLines({ fragments: {}, fragmentsOf: null, archive: [] }), ['NONE YET', 'fragments arrive with genuine frames']);
});

test('earlier letters are mentioned at the end', () => {
  const lines = letterLines({ fragments: { 1: 'a' }, fragmentsOf: 1, archive: [{ of: 2, fragments: {} }] });
  assert.equal(lines.at(-1), 'EARLIER LETTERS KEPT: 1');
});

test('LETTER ignores a page number now that it scrolls', () => {
  assert.deepEqual(parseCommand('letter 3'), { kind: 'letter' });
});

test('a long fragment wraps under its label within the screen', () => {
  const long = 'word '.repeat(20).trim();
  const lines = letterLines({ fragments: { 1: long }, fragmentsOf: 1, archive: [] });
  assert.ok(lines[0].startsWith('01 word'));
  assert.ok(lines[1].startsWith('   word'));
  for (const l of lines) assert.ok(Array.from(l).length <= COLS, l);
});
