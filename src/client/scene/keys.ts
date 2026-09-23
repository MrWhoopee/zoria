import type { Point } from './geometry.ts';

export type Quad = [Point, Point, Point, Point];
export type KeyRow = { quad: Quad; keys: Array<{ code: string; weight?: number }> };
export type Patch = {
  left: number; top: number; width: number; height: number;
  clip: string; bgSize: string; bgPos: string;
};

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function layoutRow(row: KeyRow): Map<string, Quad> {
  const [tl, tr, br, bl] = row.quad;
  const total = row.keys.reduce((sum, k) => sum + (k.weight ?? 1), 0);
  const out = new Map<string, Quad>();
  let acc = 0;
  for (const k of row.keys) {
    const t0 = acc / total;
    acc += k.weight ?? 1;
    const t1 = acc / total;
    out.set(k.code, [lerp(tl, tr, t0), lerp(tl, tr, t1), lerp(bl, br, t1), lerp(bl, br, t0)]);
  }
  return out;
}

export function layoutKeyboard(rows: KeyRow[]): Map<string, Quad> {
  const out = new Map<string, Quad>();
  for (const row of rows) for (const [code, quad] of layoutRow(row)) out.set(code, quad);
  return out;
}

export function keyPatch(q: Quad): Patch {
  const xs = q.map((p) => p.x);
  const ys = q.map((p) => p.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(...xs) - left;
  const height = Math.max(...ys) - top;
  const pct = (n: number): string => `${(n * 100).toFixed(3)}%`;
  const clip = `polygon(${q.map((p) => `${pct((p.x - left) / width)} ${pct((p.y - top) / height)}`).join(', ')})`;
  return {
    left, top, width, height, clip,
    bgSize: `${pct(1 / width)} ${pct(1 / height)}`,
    bgPos: `${pct(left / (1 - width))} ${pct(top / (1 - height))}`,
  };
}
