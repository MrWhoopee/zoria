import test from 'node:test';
import assert from 'node:assert/strict';
import { keyPatch, type Quad } from '../../src/client/scene/keys.ts';
import { KEYBOARD } from '../../src/client/scene/keyboard-map.ts';
import { GLASS, fromPhoto, glassMaskDataUri, glassOutline } from '../../src/client/scene/geometry.ts';

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
  const svg = decodeURIComponent(glassMaskDataUri());
  assert.ok(svg.includes("fill-rule='evenodd'"));
  assert.ok(svg.includes('M608 229'), svg);
  assert.ok(GLASS.rect.width > 0 && GLASS.rect.height > 0);
});

test('the glass sits on the photo tube: x 416–608, y 152–306', () => {
  const x0 = Math.round(GLASS.rect.left * 1024);
  const y0 = Math.round(GLASS.rect.top * 572);
  const x1 = Math.round((GLASS.rect.left + GLASS.rect.width) * 1024);
  const y1 = Math.round((GLASS.rect.top + GLASS.rect.height) * 572);
  assert.deepEqual([x0, y0, x1, y1], [416, 152, 608, 306]);
});

test('the glass is one smooth superellipse that touches the tube at its four midpoints', () => {
  const pts = glassOutline();
  const near = (x: number, y: number): boolean => pts.some((p) => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01);
  for (const [x, y] of [[608, 229], [512, 152], [416, 229], [512, 306]]) assert.ok(near(x, y), `${x},${y}`);
  for (const p of pts) {
    const v = Math.abs((p.x - 512) / 96) ** 5 + Math.abs((p.y - 229) / 77) ** 5;
    assert.ok(Math.abs(v - 1) < 1e-6, `${p.x},${p.y}`);
  }
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 6, 'dense enough to look smooth');
  }
});
