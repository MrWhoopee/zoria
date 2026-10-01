import type { Manifest, SlotName, StormSpec, TerrainType } from '@zoria/protocol';
import { dist, key, keyOf } from '../hex.ts';
import type { Cell } from '../hex.ts';

export interface Valley {
  slot: SlotName;
  radius: number;
  ticks: number;
  dawnAt: number;
  cells: Cell[];
  types: TerrainType[];
  terrain: Map<string, number>;
  level: Map<string, number>;
  ruins: Cell[];
  ring: Cell[];
  ringKeys: Set<string>;
  starts: { cell: Cell; slot: SlotName }[];
  seats: Record<SlotName, Cell>;
  base: Cell;
  citadel: Cell;
  cherta: number;
  rings: number[];
  cfg: Record<string, number>;
  storms: StormSpec[];
  dead: Set<string>;
  lots: { at: number; cells: Cell[] }[];
}

export function cfg(v: Valley, name: string): number {
  const x = v.cfg[name];
  if (x === undefined) throw new Error('cfg ' + name);
  return x;
}

export function inside(v: Valley, c: Cell): boolean {
  return v.level.has(keyOf(c));
}

export function levelAt(v: Valley, c: Cell): number {
  const lv = v.level.get(keyOf(c));
  if (lv === undefined) throw new Error('outside the valley ' + keyOf(c));
  return lv;
}

export function typeAt(v: Valley, c: Cell): TerrainType | null {
  if (!inside(v, c)) return null;
  return v.types[v.terrain.get(keyOf(c)) ?? 0] ?? null;
}

export function price(v: Valley, c: Cell): number {
  return typeAt(v, c)?.min ?? 0;
}

function seatOf(m: Manifest, slot: SlotName): Cell {
  const mine = m.needles.filter((n) => n.start === slot);
  const seat = m.seats.find((s) => mine.length > 0 && mine.every((n) => dist(n, s) === 1));
  if (!seat) throw new Error('no seat for ' + slot);
  return { q: seat.q, r: seat.r };
}

export function buildValley(m: Manifest, slot: SlotName): Valley {
  const radius = m.terrain.radius - 1;
  const cells: Cell[] = [];
  const level = new Map<string, number>();
  let i = 0;
  for (let r = -radius; r <= radius; r++) {
    for (let q = -radius; q <= radius; q++) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > radius) continue;
      cells.push({ q, r });
      const lv = m.levels[i];
      if (lv === undefined) throw new Error('levels end at ' + i);
      level.set(key(q, r), lv);
      i++;
    }
  }
  const terrain = new Map<string, number>();
  for (const [q, r, t] of m.terrain.cells) terrain.set(key(q, r), t);
  const ruins = m.needles.filter((n) => n.start === null && !n.ring).map((n) => ({ q: n.q, r: n.r }));
  const ring = m.needles.filter((n) => n.ring).map((n) => ({ q: n.q, r: n.r }));
  const starts = m.needles.flatMap((n) => (n.start === null ? [] : [{ cell: { q: n.q, r: n.r }, slot: n.start }]));
  const seats = { A: seatOf(m, 'A'), B: seatOf(m, 'B'), C: seatOf(m, 'C') };
  return {
    slot,
    radius,
    ticks: m.ticks,
    dawnAt: m.dawn.at,
    cells,
    types: m.terrain.types,
    terrain,
    level,
    ruins,
    ring,
    ringKeys: new Set(ring.map(keyOf)),
    starts,
    seats,
    base: seats[slot],
    citadel: { q: m.citadel.q, r: m.citadel.r },
    cherta: m.cherta,
    rings: m.rings,
    cfg: m.cfg,
    storms: m.storms,
    dead: new Set(m.finds.filter((f) => f.kind === 'dead').map((f) => key(f.q, f.r))),
    lots: m.lots.map((l) => ({ at: l.at, cells: l.cells.map((c) => ({ q: c.q, r: c.r })) })),
  };
}
