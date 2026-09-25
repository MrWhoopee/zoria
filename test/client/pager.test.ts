import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_ROWS, openScroll, scrollBy, scrollHint, scrollKey, scrollTo, scrollView } from '../../src/client/terminal/pager.ts';
import { COLS, ROWS } from '../../src/client/terminal/grid.ts';

const many = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);

test('a short text has no position marker', () => {
  const v = scrollView(openScroll('HELP', ['a', 'b']));
  assert.equal(v[0].trimEnd(), 'HELP');
  assert.deepEqual(v.slice(1), ['a', 'b']);
});

test('scrolling clamps at both ends and marks the position', () => {
  let s = openScroll('MAIL 1', many);
  assert.ok(scrollView(s)[0].endsWith('▼ TOP'));
  s = scrollBy(s, -5);
  assert.equal(s.top, 0);
  s = scrollBy(s, 100);
  assert.equal(s.top, many.length - PAGE_ROWS);
  assert.ok(scrollView(s)[0].endsWith('▲ END'));
  assert.equal(scrollView(s).at(-1), 'line 30');
  s = scrollTo(s, 'start');
  assert.equal(s.top, 0);
  s = scrollBy(s, (many.length - PAGE_ROWS) / 2);
  assert.ok(scrollView(s)[0].endsWith('▼ 50%'));
});

test('the header fits the screen even with a long title', () => {
  const v = scrollView(openScroll('X'.repeat(80), many));
  assert.ok(Array.from(v[0]).length <= COLS);
});

test('keys map to steps', () => {
  assert.equal(scrollKey('ArrowDown'), 1);
  assert.equal(scrollKey('ArrowUp'), -1);
  assert.equal(scrollKey('PageDown'), PAGE_ROWS);
  assert.equal(scrollKey('PageUp'), -PAGE_ROWS);
  assert.equal(scrollKey('Home'), 'start');
  assert.equal(scrollKey('End'), 'end');
  assert.equal(scrollKey('a'), null);
});

test('the scroll view fills the body of the screen: header, title and input rows aside', () => {
  assert.equal(PAGE_ROWS, ROWS - 5);
});

test('the bottom line tells how to move: keys for long text, Esc for short, HELP on status', () => {
  assert.equal(scrollHint(null), 'type HELP');
  assert.equal(scrollHint(openScroll('HELP', ['a'])), 'Esc back');
  assert.equal(scrollHint(openScroll('MAIL 1', many)), '↑↓ PgUp PgDn scroll · Esc back');
});
