import type { ClsName } from '@zoria/protocol';
import { keyOf, neighbors } from '../hex.ts';
import type { Cell } from '../hex.ts';
import { cfg, levelAt, typeAt } from './valley.ts';
import type { Valley } from './valley.ts';

export function stepTicks(v: Valley, from: Cell, to: Cell, cls: ClsName): number | null {
  const t = typeAt(v, to);
  if (!t || !t.pass) return null;
  const rise = levelAt(v, to) - levelAt(v, from);
  if (rise >= 2) return null;
  const step = cfg(v, cls === 'ткач' ? 'stepTkach' : 'stepKlinok');
  return step * t.cost + cfg(v, 'stepRise') * Math.max(0, rise);
}

export function travelField(v: Valley, from: Cell, cls: ClsName): Map<string, number> {
  const best = new Map<string, number>([[keyOf(from), 0]]);
  const buckets: Cell[][] = [[from]];
  for (const [d, bucket] of buckets.entries()) {
    for (const c of bucket ?? []) {
      if (best.get(keyOf(c)) !== d) continue;
      for (const n of neighbors(c)) {
        const s = stepTicks(v, c, n, cls);
        if (s === null) continue;
        const k = keyOf(n);
        const nd = d + s;
        if (nd >= (best.get(k) ?? Infinity)) continue;
        best.set(k, nd);
        (buckets[nd] ??= []).push(n);
      }
    }
  }
  return best;
}
