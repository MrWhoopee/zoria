import test from 'node:test';
import assert from 'node:assert/strict';
import { keyPatch, layoutRow, type Quad } from '../../src/client/scene/keys.ts';
import { KEYBOARD } from '../../src/client/scene/keyboard-map.ts';
import { GLASS, fromPhoto, glassMaskDataUri } from '../../src/client/scene/geometry.ts';

const unit: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

test('equal keys split a row into equal parts', () => {
  const m = layoutRow({ quad: unit, keys: [{ code: 'A' }, { code: 'B' }, { code: 'C' }] });
  assert.ok(Math.abs(m.get('B')![0].x - 1 / 3) < 1e-9);
  assert.ok(Math.abs(m.get('C')![0].x - 2 / 3) < 1e-9);
});

test('a key twice as wide takes twice the room', () => {
  const m = layoutRow({ quad: unit, keys: [{ code: 'A' }, { code: 'B', weight: 2 }] });
  assert.ok(Math.abs(m.get('A')![1].x - 1 / 3) < 1e-9);
});

test('neighbouring keys share an edge with no gap', () => {
  const m = layoutRow({ quad: unit, keys: [{ code: 'A' }, { code: 'B' }] });
  assert.deepEqual(m.get('A')![1], m.get('B')![0]);
  assert.deepEqual(m.get('A')![2], m.get('B')![3]);
});

test('a row in perspective keeps its outer corners on the row quad', () => {
  const trapezoid: Quad = [{ x: 0.1, y: 0 }, { x: 0.9, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const m = layoutRow({ quad: trapezoid, keys: [{ code: 'A' }, { code: 'B' }, { code: 'C' }] });
  assert.deepEqual(m.get('A')![0], trapezoid[0]);
  assert.deepEqual(m.get('C')![2], trapezoid[2]);
});

test('the photo keyboard knows the keys people type', () => {
  for (const code of ['KeyA', 'KeyZ', 'Digit1', 'Enter', 'Backspace', 'ShiftLeft', 'ShiftRight', 'Space']) {
    assert.ok(KEYBOARD.has(code), code);
  }
});

test('a key with no counterpart on the photo is simply absent', () => {
  for (const code of ['IntlBackslash', 'Numpad5', 'MediaPlayPause', 'F5']) {
    assert.equal(KEYBOARD.get(code), undefined, code);
  }
});

test('every key sits inside the keyboard area of the photo', () => {
  const top = fromPhoto(0, 348).y;
  const bottom = fromPhoto(0, 410).y;
  for (const [code, quad] of KEYBOARD) {
    for (const p of quad) {
      assert.ok(p.x >= 0 && p.x <= 1, code);
      assert.ok(p.y >= top && p.y <= bottom, `${code} y=${p.y}`);
    }
  }
});

test('a patch lines the photo up behind the key', () => {
  const q: Quad = [{ x: 0.25, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.75 }, { x: 0.25, y: 0.75 }];
  const p = keyPatch(q);
  assert.equal(p.left, 0.25);
  assert.equal(p.width, 0.25);
  assert.equal(p.clip, 'polygon(0.000% 0.000%, 100.000% 0.000%, 100.000% 100.000%, 0.000% 100.000%)');
  assert.equal(p.bgSize, '400.000% 400.000%');
  assert.equal(p.bgPos, '33.333% 66.667%');
});

test('the glass mask is an even-odd hole where the glass is', () => {
  const svg = decodeURIComponent(glassMaskDataUri().replace(/^url\("data:image\/svg\+xml,/, '').replace(/"\)$/, ''));
  assert.ok(svg.includes("fill-rule='evenodd'"));
  assert.ok(svg.includes('M430 143'), svg);
  assert.ok(GLASS.rect.width > 0 && GLASS.rect.height > 0);
});
