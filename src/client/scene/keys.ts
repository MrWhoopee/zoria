import type { Point } from './geometry.ts';

export type Quad = [Point, Point, Point, Point];
export type Patch = {
  left: number; top: number; width: number; height: number;
  clip: string; bgSize: string; bgPos: string;
};

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
