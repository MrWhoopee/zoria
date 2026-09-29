import type { ClsName } from '@zoria/protocol';
import { keyOf, neighbors } from '../hex.ts';
import type { Cell } from '../hex.ts';
import { cfg, typeAt } from './valley.ts';
import type { Valley } from './valley.ts';

export function stepTicks(v: Valley, from: Cell, to: Cell, cls: ClsName): number | null {
  const t = typeAt(v, to);
  if (!t || !t.pass) return null;
  const rise = (v.level.get(keyOf(to)) ?? 0) - (v.level.get(keyOf(from)) ?? 0);
  if (rise >= 2) return null;
  const step = cfg(v, cls === 'ткач' ? 'stepTkach' : 'stepKlinok');
  return step * t.cost + cfg(v, 'stepRise') * Math.max(0, rise);
}

type Item = [number, Cell];

function push(h: Item[], x: Item): void {
  h.push(x);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    const a = h[p];
    const b = h[i];
    if (!a || !b || a[0] <= b[0]) break;
    h[p] = b;
    h[i] = a;
    i = p;
  }
}

function pop(h: Item[]): Item | undefined {
  const top = h[0];
  const last = h.pop();
  if (h.length > 0 && last) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if ((h[l]?.[0] ?? Infinity) < (h[m]?.[0] ?? Infinity)) m = l;
      if ((h[r]?.[0] ?? Infinity) < (h[m]?.[0] ?? Infinity)) m = r;
      if (m === i) break;
      const a = h[m];
      const b = h[i];
      if (!a || !b) break;
      h[m] = b;
      h[i] = a;
      i = m;
    }
  }
  return top;
}

export function travelField(v: Valley, from: Cell, cls: ClsName): Map<string, number> {
  const best = new Map<string, number>([[keyOf(from), 0]]);
  const heap: Item[] = [[0, from]];
  for (let it = pop(heap); it; it = pop(heap)) {
    const [d, c] = it;
    if (d > (best.get(keyOf(c)) ?? Infinity)) continue;
    for (const n of neighbors(c)) {
      const s = stepTicks(v, c, n, cls);
      if (s === null) continue;
      const nd = d + s;
      const k = keyOf(n);
      if (nd < (best.get(k) ?? Infinity)) {
        best.set(k, nd);
        push(heap, [nd, n]);
      }
    }
  }
  return best;
}
