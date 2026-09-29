import { disc, dist, keyOf } from '../hex.ts';
import type { Cell } from '../hex.ts';
import { inside, price } from './valley.ts';
import type { Valley } from './valley.ts';

export type Pull = Map<string, number>;

export interface Source {
  cell: Cell;
  mult: number;
}

export function pullOf(v: Valley, sources: Source[]): Pull {
  const p: Pull = new Map();
  const reach = v.rings.length - 1;
  for (const s of sources) {
    for (const c of disc(s.cell, reach)) {
      if (!inside(v, c)) continue;
      const w = (v.rings[dist(c, s.cell)] ?? 0) * s.mult;
      const k = keyOf(c);
      p.set(k, (p.get(k) ?? 0) + w);
    }
  }
  return p;
}

export function share(own: number, foe: number): number {
  const sum = own + foe;
  return sum <= 1 ? own : own / sum;
}

export function gain(v: Valley, site: Cell, own: Pull, foe: Pull, mult = 1): number {
  let total = 0;
  for (const c of disc(site, v.rings.length - 1)) {
    const cost = price(v, c);
    if (cost === 0) continue;
    const k = keyOf(c);
    const o = own.get(k) ?? 0;
    const f = foe.get(k) ?? 0;
    const w = (v.rings[dist(c, site)] ?? 0) * mult;
    total += cost * (share(o + w, f) - share(o, f));
  }
  return total;
}
