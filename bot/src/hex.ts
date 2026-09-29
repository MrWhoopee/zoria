import type { Hex } from '@zoria/protocol';

export type Cell = Hex;

export const key = (q: number, r: number): string => q + ',' + r;

export const keyOf = (c: Cell): string => key(c.q, c.r);

export function parse(k: string): Cell {
  const i = k.indexOf(',');
  return { q: Number(k.slice(0, i)), r: Number(k.slice(i + 1)) };
}

export function dist(a: Cell, b: Cell): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export const DIRS: readonly Cell[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function neighbors(c: Cell): Cell[] {
  return DIRS.map((d) => ({ q: c.q + d.q, r: c.r + d.r }));
}

export function disc(c: Cell, rad: number): Cell[] {
  const out: Cell[] = [];
  for (let dq = -rad; dq <= rad; dq++) {
    const lo = Math.max(-rad, -dq - rad);
    const hi = Math.min(rad, -dq + rad);
    for (let dr = lo; dr <= hi; dr++) out.push({ q: c.q + dq, r: c.r + dr });
  }
  return out;
}
