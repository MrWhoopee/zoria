export type Point = { x: number; y: number };
export type Line = { p: Point; d: Point };
export type Side = 'next' | 'prev';
export type PageFrame = { w: number; h: number };
export type Matrix = [number, number, number, number, number, number];

export type Curl = {
  page: Point[];
  leaf: Point[];
  back: Point[];
  backMatrix: Matrix;
  shadow: { x: number; y: number; angleDeg: number; length: number };
};

const MIN_PULL = 0.5;

export function origin(side: Side, f: PageFrame): Point {
  return side === 'next' ? { x: 2 * f.w, y: 0 } : { x: 0, y: 0 };
}

export function target(side: Side, f: PageFrame): Point {
  return side === 'next' ? { x: 0, y: 0 } : { x: 2 * f.w, y: 0 };
}

function pageRect(side: Side, f: PageFrame): Point[] {
  const x0 = side === 'next' ? f.w : 0;
  return [{ x: x0, y: 0 }, { x: x0 + f.w, y: 0 }, { x: x0 + f.w, y: f.h }, { x: x0, y: f.h }];
}

function pullWithin(p: Point, anchor: Point, radius: number): Point {
  const dx = p.x - anchor.x;
  const dy = p.y - anchor.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= radius) return p;
  return { x: anchor.x + (dx * radius) / dist, y: anchor.y + (dy * radius) / dist };
}

export function constrain(_side: Side, f: PageFrame, p: Point): Point {
  const top = { x: f.w, y: 0 };
  const bottom = { x: f.w, y: f.h };
  const diagonal = Math.hypot(f.w, f.h);
  let q = p;
  for (let i = 0; i < 3; i += 1) q = pullWithin(pullWithin(q, top, f.w), bottom, diagonal);
  return q;
}

export function foldLine(corner: Point, pointer: Point): Line | null {
  const dx = pointer.x - corner.x;
  const dy = pointer.y - corner.y;
  const len = Math.hypot(dx, dy);
  if (len < MIN_PULL) return null;
  return {
    p: { x: (corner.x + pointer.x) / 2, y: (corner.y + pointer.y) / 2 },
    d: { x: -dy / len, y: dx / len },
  };
}

const side = (line: Line, q: Point): number => line.d.x * (q.y - line.p.y) - line.d.y * (q.x - line.p.x);

export function clipHalf(poly: Point[], line: Line, keep: Point): Point[] {
  const sign = Math.sign(side(line, keep)) || 1;
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(line, a) * sign;
    const sb = side(line, b) * sign;
    if (sa >= 0) out.push(a);
    if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function reflectionMatrix(line: Line): Matrix {
  const { x: dx, y: dy } = line.d;
  const a = dx * dx - dy * dy;
  const b = 2 * dx * dy;
  const d = dy * dy - dx * dx;
  const e = line.p.x - (a * line.p.x + b * line.p.y);
  const f = line.p.y - (b * line.p.x + d * line.p.y);
  return [a, b, b, d, e, f];
}

function compose(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function reflect(line: Line, q: Point): Point {
  const [a, b, c, d, e, f] = reflectionMatrix(line);
  return { x: a * q.x + c * q.y + e, y: b * q.x + d * q.y + f };
}

export function area(poly: Point[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function curl(s: Side, f: PageFrame, pointer: Point): Curl | null {
  const corner = origin(s, f);
  const p = constrain(s, f, pointer);
  const fold = foldLine(corner, p);
  if (!fold) return null;
  const rect = pageRect(s, f);
  const leaf = clipHalf(rect, fold, corner);
  const spine: Line = { p: { x: f.w, y: 0 }, d: { x: 0, y: 1 } };
  return {
    page: clipHalf(rect, fold, p),
    leaf,
    back: leaf.map((q) => reflect(fold, q)),
    backMatrix: compose(reflectionMatrix(fold), reflectionMatrix(spine)),
    shadow: {
      x: fold.p.x,
      y: fold.p.y,
      angleDeg: (Math.atan2(fold.d.y, fold.d.x) * 180) / Math.PI,
      length: 2 * Math.hypot(f.w, f.h),
    },
  };
}

const px = (n: number): string => `${+n.toFixed(2)}px`;

export function polygonCss(poly: Point[]): string {
  const pts = poly.length >= 3 ? poly : [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
  return `polygon(${pts.map((q) => `${px(q.x)} ${px(q.y)}`).join(', ')})`;
}

export function matrixCss(m: Matrix): string {
  return `matrix(${m.map((v) => `${+v.toFixed(6)}`).join(', ')})`;
}
