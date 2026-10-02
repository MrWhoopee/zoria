import test from 'node:test';
import assert from 'node:assert/strict';
import { menuItems } from '../../src/arena/menu.ts';
import type { ArenaFrame, ArenaMap, ArenaUnit } from '../../bot/arena/frame.ts';

const frame = {
  own: { '5,-8': 'A', '6,6': 'B', '0,0': 'K', '7,-13': 'A' },
  foe: [['T-A3', 'A', 'ткач', 7, 2]],
} as unknown as ArenaFrame;
const map = { slot: 'B', cells: [], seats: { A: { q: 6, r: -12 }, B: { q: 6, r: 6 }, C: { q: -12, r: 6 } }, ring: [], starts: [{ q: 7, r: -13 }] } as unknown as ArenaMap;
const kl: ArenaUnit = { id: 'K-B7', cls: 'клинок', q: 5, r: -7, manual: true, goal: null, task: 'idle' };
const tk: ArenaUnit = { id: 'T-B1', cls: 'ткач', q: 6, r: 6, manual: false, goal: null, task: 'idle' };
const labels = (xs: { label: string }[]) => xs.map((x) => x.label);

test('a selected Klinok can move, jam a foe needle, ram a foe unit, halt and go home', () => {
  assert.deepEqual(labels(menuItems(frame, map, { q: 5, r: -8 }, kl)), ['Відпустити', 'Рух', 'Глушити', 'Стоп', 'Додому']);
  const ram = menuItems(frame, map, { q: 7, r: 2 }, kl);
  assert.deepEqual(labels(ram), ['Відпустити', 'Рух', 'Таран', 'Стоп', 'Додому']);
  assert.deepEqual(ram[2]?.command, { kind: 'order', order: { kind: 'ram', unit: 'K-B7', target: 'T-A3' } });
  assert.deepEqual(menuItems(frame, map, { q: 5, r: -8 }, kl)[2]?.command, { kind: 'order', order: { kind: 'jam', unit: 'K-B7', target: { q: 5, r: -8 }, hold: true } });
  assert.deepEqual(menuItems(frame, map, { q: 1, r: 1 }, kl).at(-1)?.command, { kind: 'order', order: { kind: 'move', unit: 'K-B7', q: 6, r: 6, goal: null, home: true } });
});

test('a selected bot Tkach can be taken and can build on an empty cell only', () => {
  assert.deepEqual(labels(menuItems(frame, map, { q: 1, r: 1 }, tk)), ['Перехопити', 'Рух', 'Будувати', 'Стоп', 'Додому']);
  assert.deepEqual(labels(menuItems(frame, map, { q: 5, r: -8 }, tk)), ['Перехопити', 'Рух', 'Стоп', 'Додому']);
  assert.deepEqual(menuItems(frame, map, { q: 1, r: 1 }, tk)[0]?.command, { kind: 'take', unit: 'T-B1' });
});

test('with nothing selected the menu gives the bot goals for the cell', () => {
  assert.deepEqual(menuItems(frame, map, { q: 5, r: -8 }, null).map((x) => x.command), [{ kind: 'goal', goal: 'jam', cell: { q: 5, r: -8 } }]);
  assert.deepEqual(menuItems(frame, map, { q: 7, r: 2 }, null).map((x) => x.command), [{ kind: 'goal', goal: 'ram', target: 'T-A3' }, { kind: 'goal', goal: 'build', cell: { q: 7, r: 2 } }]);
  assert.deepEqual(menuItems(frame, map, { q: 6, r: 6 }, null), []);
  assert.deepEqual(menuItems(frame, map, { q: 0, r: 0 }, null), []);
});

test('shielded start needles are never offered for jamming', () => {
  assert.deepEqual(menuItems(frame, map, { q: 7, r: -13 }, null), []);
  assert.deepEqual(labels(menuItems(frame, map, { q: 7, r: -13 }, kl)), ['Відпустити', 'Рух', 'Стоп', 'Додому']);
});
