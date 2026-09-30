import type { Trio } from './jobs.ts';

export interface Breakdown {
  network: number;
  orders: number;
  stolen: number;
  jams: number;
  rams: number;
  pactTax: number;
}

export interface PackRecord {
  seed: number;
  cast: Trio;
  shares: [number, number, number];
  matches: { score: number[]; breakdown: Breakdown[] }[];
}

export interface Standing extends Breakdown {
  name: string;
  packs: number;
  shares: number;
  mean: number;
  firsts: number;
}

const KEYS: (keyof Breakdown)[] = ['network', 'orders', 'stolen', 'jams', 'rams', 'pactTax'];

export function standings(records: PackRecord[]): Standing[] {
  const acc = new Map<string, Standing & { matches: number }>();
  for (const r of records) {
    const top = Math.max(...r.shares);
    const winners = r.shares.filter((s) => s === top).length;
    r.cast.forEach((name, i) => {
      const s = acc.get(name) ?? { name, packs: 0, shares: 0, mean: 0, firsts: 0, matches: 0, network: 0, orders: 0, stolen: 0, jams: 0, rams: 0, pactTax: 0 };
      const share = r.shares[i] ?? 0;
      s.packs++;
      s.shares += share;
      if (share === top && winners === 1) s.firsts++;
      for (const m of r.matches) {
        const b = m.breakdown[i];
        if (!b) continue;
        s.matches++;
        for (const k of KEYS) s[k] += b[k];
      }
      acc.set(name, s);
    });
  }
  return [...acc.values()]
    .map(({ matches, ...s }) => {
      const out: Standing = { ...s, mean: s.shares / s.packs };
      for (const k of KEYS) out[k] = matches > 0 ? s[k] / matches : 0;
      return out;
    })
    .sort((a, b) => b.mean - a.mean || a.name.localeCompare(b.name));
}

export function headToHead(records: PackRecord[], a: string, b: string): { packs: number; diff: number } {
  let packs = 0;
  let sum = 0;
  for (const r of records) {
    const ia = r.cast.indexOf(a);
    const ib = r.cast.indexOf(b);
    if (ia < 0 || ib < 0) continue;
    packs++;
    sum += (r.shares[ia] ?? 0) - (r.shares[ib] ?? 0);
  }
  return { packs, diff: packs > 0 ? sum / packs : 0 };
}

export function worst(records: PackRecord[], name: string, n: number): PackRecord[] {
  return records
    .filter((r) => r.cast.includes(name))
    .sort((x, y) => (x.shares[x.cast.indexOf(name)] ?? 0) - (y.shares[y.cast.indexOf(name)] ?? 0) || x.seed - y.seed)
    .slice(0, n);
}
