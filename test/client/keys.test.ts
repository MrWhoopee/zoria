import test from 'node:test';
import assert from 'node:assert/strict';
import { keyPatch, type Quad } from '../../src/client/scene/keys.ts';
import { KEYBOARD } from '../../src/client/scene/keyboard-map.ts';
import { GLASS, fromPhoto, glassMaskDataUri } from '../../src/client/scene/geometry.ts';

test('the photo keyboard knows the keys people type', () => {
  for (const code of ['KeyA', 'KeyZ', 'Digit1', 'Enter', 'Backspace', 'ShiftLeft', 'ShiftRight', 'Space']) {
    assert.ok(KEYBOARD.has(code), code);
  }
});

test('a key with no counterpart on the photo is simply absent', () => {
  for (const code of ['Numpad5', 'MediaPlayPause', 'F5', 'MetaLeft']) {
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

test('keys on the same row never overlap', () => {
  const quads = [...KEYBOARD.values()].sort((a, b) => a[0].x - b[0].x);
  for (const a of quads) {
    for (const b of quads) {
      if (a === b) continue;
      const apart = a[1].x <= b[0].x || b[1].x <= a[0].x || a[2].y <= b[0].y || b[2].y <= a[0].y;
      assert.ok(apart, `${JSON.stringify(a[0])} overlaps ${JSON.stringify(b[0])}`);
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
