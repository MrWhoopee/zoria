import test from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS, composeScreen, fit, splitAtColumn } from '../../src/client/terminal/grid.ts';

const width = (s: string): number => Array.from(s).length;

test('the screen is exactly 20 rows of exactly 54 columns', () => {
  assert.deepEqual([ROWS, COLS], [20, 54]);
  const s = composeScreen({ header: ['A'], body: ['B'], input: 'C', hint: 'D' });
  assert.equal(s.lines.length, ROWS);
  for (const line of s.lines) assert.equal(width(line), COLS);
});

test('header comes first, body after it, input on the second-to-last row, hint on the last', () => {
  const s = composeScreen({ header: ['HEAD'], body: ['BODY'], input: 'HELP', hint: 'type HELP' });
  assert.equal(s.lines[0].trimEnd(), 'HEAD');
  assert.equal(s.lines[1].trimEnd(), 'BODY');
  assert.equal(s.lines[ROWS - 2].trimEnd(), '> HELP');
  assert.equal(s.lines[ROWS - 1].trimEnd(), 'type HELP');
});

test('a body taller than the room left keeps its last lines', () => {
  const body = Array.from({ length: 30 }, (_, i) => `L${i}`);
  const s = composeScreen({ header: ['H'], body, input: '', hint: '' });
  assert.equal(s.lines[1].trimEnd(), `L${30 - (ROWS - 3)}`);
  assert.equal(s.lines[ROWS - 3].trimEnd(), 'L29');
});

test('input longer than the line keeps its tail visible and the cursor inside the grid', () => {
  const input = 'X'.repeat(80) + 'TAIL';
  const s = composeScreen({ header: [], body: [], input, hint: '' });
  assert.ok(s.lines[ROWS - 2].includes('TAIL'));
  assert.equal(width(s.lines[ROWS - 2]), COLS);
  assert.equal(s.cursor.row, ROWS - 2);
  assert.ok(s.cursor.col <= COLS - 1);
});

test('the cursor sits right after the typed text', () => {
  const s = composeScreen({ header: [], body: [], input: 'AB', hint: '' });
  assert.deepEqual(s.cursor, { row: ROWS - 2, col: 4 });
});

test('box-drawing and Cyrillic characters count as one column each', () => {
  assert.equal(width(fit('│░✗·Зоря', 10)), 10);
  assert.equal(fit('│░✗·Зоря', 4), '│░✗·');
});

test('an empty screen still shows the prompt', () => {
  const s = composeScreen({ header: [], body: [], input: '', hint: '' });
  assert.equal(s.lines[ROWS - 2].trimEnd(), '>');
});

test('splitting at the cursor column never cuts a character in half', () => {
  assert.deepEqual(splitAtColumn('> AB  ', 4), ['> AB', ' ']);
  assert.deepEqual(splitAtColumn('> 😀😀X', 3), ['> 😀', 'X']);
  assert.deepEqual(splitAtColumn('> ', 2), ['> ', '']);
});
