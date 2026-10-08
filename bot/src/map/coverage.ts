import { disc, dist, keyOf } from '../hex.ts';
import type { Cell } from '../hex.ts';
import { inside, price } from './valley.ts';
import type { Valley } from './valley.ts';

export type Pull = Map<string, number>;

export function ringWeight(v: Valley, d: number): number {
  const w = v.rings[d];
  if (w === undefined) throw new Error('no ring weight at ' + d);
  return w;
}

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
      const w = ringWeight(v, dist(c, s.cell)) * s.mult;
      const k = keyOf(c);
      p.set(k, (p.get(k) ?? 0) + w);
    }
  }
  return p;
}

export function share(own: number, foe: number): number {
  return own / Math.max(1, own + foe);
}

export function gain(v: Valley, site: Cell, own: Pull, foe: Pull, mult = 1): number {
  let total = 0;
  for (const c of disc(site, v.rings.length - 1)) {
    const cost = price(v, c);
    const k = keyOf(c);
    const o = own.get(k) ?? 0;
    const f = foe.get(k) ?? 0;
    const w = ringWeight(v, dist(c, site)) * mult;
    total += cost * (share(o + w, f) - share(o, f));
  }
  return total;
}

export function takeGain(v: Valley, site: Cell, own: Pull, foe: Pull, foeMult: number, harm: number): number {
  let total = 0;
  for (const c of disc(site, v.rings.length - 1)) {
    const cost = price(v, c);
    const k = keyOf(c);
    const ring = ringWeight(v, dist(c, site));
    const o = own.get(k) ?? 0;
    const f = foe.get(k) ?? 0;
    const f2 = Math.max(0, f - ring * foeMult);
    const ours = share(o + ring, f2) - share(o, f);
    const theirs = share(f, o) - share(f2, o + ring);
    total += cost * (ours + harm * theirs);
  }
  return total;
}

export function feedGain(v: Valley, site: Cell, own: Pull, foe: Pull): number {
  const reach = v.rings.length;
  let total = 0;
  for (const c of disc(site, reach)) {
    if (!inside(v, c)) continue;
    const d = dist(c, site);
    if (d < 2) continue;
    const fed = ringWeight(v, d - 1);
    const was = d < reach ? ringWeight(v, d) : 0;
    const k = keyOf(c);
    const o = own.get(k) ?? 0;
    const f = foe.get(k) ?? 0;
    total += price(v, c) * (share(o + fed - was, f) - share(o, f));
  }
  return total;
}
