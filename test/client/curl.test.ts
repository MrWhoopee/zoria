import test from 'node:test';
import assert from 'node:assert/strict';
import {
  area, clipHalf, constrain, curl, foldLine, matrixCss, origin, polygonCss, reflect, target, type Point,
} from '../../src/client/notebook/curl.ts';

const F = { w: 400, h: 560 };
const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) < eps;
const samePoint = (a: Point, b: Point): boolean => near(a.x, b.x, 1e-6) && near(a.y, b.y, 1e-6);

test('the fold is the line that maps the grabbed corner onto the pointer', () => {
  const corner = origin('next', F);
  const p = { x: 600, y: 120 };
  const fold = foldLine(corner, p);
  assert.ok(fold);
  if (fold) assert.ok(samePoint(reflect(fold, corner), p));
});

test('no fold while the pointer sits on the corner', () => {
  assert.equal(foldLine(origin('next', F), origin('next', F)), null);
  assert.equal(curl('next', F, origin('next', F)), null);
});

test('the leaf and what is left of the page add up to the whole page', () => {
  const g = curl('next', F, { x: 560, y: 200 });
  assert.ok(g);
  if (!g) return;
  assert.ok(near(area(g.leaf) + area(g.page), F.w * F.h, 1e-3));
  assert.ok(near(area(g.back), area(g.leaf), 1e-3), 'the back of the leaf is the leaf, folded over');
});

test('a finished turn puts the back of the leaf exactly where the next left page lives', () => {
  const g = curl('next', F, target('next', F));
  assert.ok(g);
  if (!g) return;
  const [a, b, c, d, e, f] = g.backMatrix;
  assert.ok(near(a, 1) && near(b, 0) && near(c, 0) && near(d, 1) && near(e, 0) && near(f, 0), g.backMatrix.join(','));
  assert.ok(near(area(g.leaf), F.w * F.h, 1e-3));
  assert.ok(near(area(g.page), 0, 1e-3));
});

test('turning back mirrors turning forward', () => {
  const fwd = curl('next', F, { x: 560, y: 200 });
  const back = curl('prev', F, { x: 2 * F.w - 560, y: 200 });
  assert.ok(fwd && back);
  if (fwd && back) assert.ok(near(area(fwd.leaf), area(back.leaf), 1e-3));
  const done = curl('prev', F, target('prev', F));
  assert.ok(done && near(done.backMatrix[0], 1) && near(done.backMatrix[4], F.w));
});

test('the back of the leaf follows the pointer by its outer corner on either side', () => {
  const apply = (m: number[], q: Point): Point => ({ x: m[0] * q.x + m[2] * q.y + m[4], y: m[1] * q.x + m[3] * q.y + m[5] });
  const cases = [
    { side: 'next' as const, pointer: { x: 560, y: 120 }, corner: { x: 0, y: 0 } },
    { side: 'prev' as const, pointer: { x: 240, y: 120 }, corner: { x: F.w, y: 0 } },
  ];
  for (const { side, pointer, corner } of cases) {
    const g = curl(side, F, pointer);
    assert.ok(g);
    if (g) assert.ok(samePoint(apply(g.backMatrix, corner), pointer), side);
  }
});

test('the paper never tears away from the spine', () => {
  for (const p of [{ x: -900, y: -300 }, { x: -200, y: 1400 }, { x: 400, y: -500 }, { x: 900, y: 900 }]) {
    const c = constrain('next', F, p);
    assert.ok(Math.hypot(c.x - F.w, c.y) <= F.w + 1e-6, `top ${JSON.stringify(c)}`);
    assert.ok(Math.hypot(c.x - F.w, c.y - F.h) <= Math.hypot(F.w, F.h) + 1e-6, `bottom ${JSON.stringify(c)}`);
  }
  const inside = { x: 700, y: 100 };
  assert.deepEqual(constrain('next', F, inside), inside);
});

test('a half-plane cut of a square by its diagonal is a triangle', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const tri = clipHalf(square, { p: { x: 0, y: 0 }, d: { x: Math.SQRT1_2, y: Math.SQRT1_2 } }, { x: 10, y: 0 });
  assert.equal(tri.length, 3);
  assert.ok(near(area(tri), 50));
});

test('polygons and matrices become CSS', () => {
  assert.equal(polygonCss([{ x: 0, y: 1.5 }, { x: 2, y: 3 }, { x: 4, y: 5 }]), 'polygon(0px 1.5px, 2px 3px, 4px 5px)');
  assert.equal(polygonCss([]), 'polygon(0px 0px, 0px 0px, 0px 0px)');
  assert.equal(matrixCss([1, 0, 0, 1, 5, 6]), 'matrix(1, 0, 0, 1, 5, 6)');
});
