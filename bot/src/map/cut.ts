import { keyOf } from '../hex.ts';
import type { Cell } from '../hex.ts';

function reached(base: Cell, lit: Cell[], ok: (a: Cell, b: Cell) => boolean, skip: string | null): number {
  const left = lit.filter((n) => keyOf(n) !== skip);
  const seen = new Set<string>();
  const queue = left.filter((n) => ok(base, n));
  for (const n of queue) seen.add(keyOf(n));
  for (let i = 0; i < queue.length; i++) {
    const a = queue[i]!;
    for (const b of left) {
      const k = keyOf(b);
      if (seen.has(k) || !ok(a, b)) continue;
      seen.add(k);
      queue.push(b);
    }
  }
  return seen.size;
}

export function cutLoss(base: Cell, lit: Cell[], ok: (a: Cell, b: Cell) => boolean): Map<string, number> {
  const all = reached(base, lit, ok, null);
  const out = new Map<string, number>();
  for (const n of lit) out.set(keyOf(n), Math.max(0, all - 1 - reached(base, lit, ok, keyOf(n))));
  return out;
}
