import type { MineUnit, Order } from '@zoria/protocol';
import { disc, dist, keyOf } from '../hex.ts';
import type { Cell } from '../hex.ts';
import { gain, pullOf } from '../map/coverage.ts';
import type { Pull } from '../map/coverage.ts';
import { travelField } from '../map/travel.ts';
import { cfg, inside, price, typeAt } from '../map/valley.ts';
import { bytesFor } from './types.ts';
import type { Ctx, Reservation, Task } from './types.ts';
import { TKACH_TARGET } from './yard.ts';

export const RESERVE_TTL = 200;
export const REISSUE_GAP = 6;
const BANNING = new Set([11, 12, 21]);

interface Site {
  cell: Cell;
  kind: 'take' | 'build';
  gain: number;
}

export function release(ctx: Ctx): void {
  const { w, memo, v } = ctx;
  const alive = new Set(w.units.map((u) => u.id));
  for (const [id, r] of memo.res) {
    const o = w.owner.get(keyOf(r.cell));
    const done = r.kind !== 'feed' && o === v.slot;
    const gone = r.kind === 'take' ? o !== null && o !== v.slot : r.kind === 'build' ? o !== undefined && o !== v.slot : o !== v.slot;
    if (!alive.has(id) || done || gone || w.t - r.since > RESERVE_TTL) memo.res.delete(id);
  }
}

function buildable(ctx: Ctx, c: Cell): boolean {
  const { v, w } = ctx;
  const t = typeAt(v, c);
  const k = keyOf(c);
  if (!t || !t.pass || !t.build || w.owner.has(k) || v.dead.has(k)) return false;
  return Object.values(v.seats).every((s) => dist(s, c) > 2);
}

function sites(ctx: Ctx, anchors: Cell[], own: Pull, foe: Pull, reserved: Set<string>): Site[] {
  const { v, w, links, memo } = ctx;
  const out: Site[] = [];
  const free = (k: string): boolean => !reserved.has(k) && !memo.banned.has(k);
  for (const c of v.ruins) {
    const k = keyOf(c);
    if (w.owner.get(k) !== null || !free(k) || !links.reach(c, anchors)) continue;
    out.push({ cell: c, kind: 'take', gain: gain(v, c, own, foe) });
  }
  const tkachs = w.units.filter((u) => u.cls === 'ткач').length;
  const need = cfg(v, 'costNeedle') + (tkachs < TKACH_TARGET ? cfg(v, 'costTkach') : 0);
  if (w.energy >= need) {
    const seen = new Set<string>();
    const range = cfg(v, 'linkRange');
    for (const a of anchors) {
      for (const c of disc(a, range)) {
        const k = keyOf(c);
        if (seen.has(k) || dist(a, c) < 3) continue;
        seen.add(k);
        if (!inside(v, c) || !free(k) || !buildable(ctx, c) || !links.reach(c, anchors)) continue;
        out.push({ cell: c, kind: 'build', gain: gain(v, c, own, foe) });
      }
    }
  }
  return out.filter((s) => s.gain > 0);
}

function siteOrder(unit: string, s: { cell: Cell; kind: 'take' | 'build' }): Order {
  if (s.kind === 'take') return { kind: 'move', unit, q: s.cell.q, r: s.cell.r, goal: { q: s.cell.q, r: s.cell.r }, home: false };
  return { kind: 'needle', unit, q: s.cell.q, r: s.cell.r };
}

function taskFor(ctx: Ctx, u: MineUnit, kind: Reservation['kind'], cell: Cell, order: Order, value: number, since: number): Task {
  const k = keyOf(cell);
  return {
    tag: 'expand:' + kind,
    unit: u.id,
    order,
    value,
    bytes: bytesFor(ctx, order.kind, u),
    hands: u.task === null ? cfg(ctx.v, 'chanTick') : 0,
    energy: 0,
    commit: (m, t) => {
      m.res.set(u.id, { kind, cell, since: since < 0 ? t : since, sent: t });
    },
    refused: (m, code) => {
      m.res.delete(u.id);
      if (BANNING.has(code)) m.banned.add(k);
    },
  };
}

function feedCell(ctx: Ctx, taken: Set<string>): Cell | null {
  const { v, w, memo } = ctx;
  const fed = new Set([...memo.res.values()].filter((r) => r.kind === 'feed').map((r) => keyOf(r.cell)));
  let best: Cell | null = null;
  let bestValue = 0;
  for (const c of w.ownLit()) {
    const k = keyOf(c);
    if (fed.has(k) || taken.has(k)) continue;
    let value = 0;
    for (const x of disc(c, 4)) if (dist(x, c) >= 2) value += price(v, x);
    if (value > bestValue) {
      bestValue = value;
      best = c;
    }
  }
  return best;
}

export function expand(ctx: Ctx): Task[] {
  const { v, w, memo } = ctx;
  release(ctx);
  const lit = w.ownLit();
  const anchors = [v.base, ...lit];
  const own = pullOf(v, lit.map((c) => ({ cell: c, mult: 1 })));
  const foe = pullOf(v, w.foeLit());
  const reserved = new Set([...memo.res.values()].map((r) => keyOf(r.cell)));
  const tasks: Task[] = [];
  const ready = w.units.filter((u) => u.cls === 'ткач' && u.wait === 0).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const u of ready) {
    const r = memo.res.get(u.id);
    if (!r || r.kind === 'feed' || u.task !== null || w.t - r.sent < REISSUE_GAP) continue;
    if (r.kind === 'take' && u.q === r.cell.q && u.r === r.cell.r) continue;
    tasks.push(taskFor(ctx, u, r.kind, r.cell, siteOrder(u.id, { cell: r.cell, kind: r.kind }), 1, r.since));
  }
  const free = ready.filter((u) => {
    const r = memo.res.get(u.id);
    return !r || r.kind === 'feed';
  });
  if (free.length === 0) return tasks;
  const all = sites(ctx, anchors, own, foe, reserved);
  const rate = cfg(v, 'minuteRate');
  const left = v.ticks - w.t;
  const taken = new Set<string>();
  for (const u of free) {
    const field = travelField(v, u, 'ткач');
    let best: Site | null = null;
    let bestScore = 0;
    for (const s of all) {
      const k = keyOf(s.cell);
      if (taken.has(k)) continue;
      const travel = field.get(k);
      if (travel === undefined) continue;
      const eta = travel + cfg(v, s.kind === 'take' ? 'heatNeedle' : 'buildTicks');
      const score = (s.gain * rate * Math.max(0, left - eta)) / (eta + 1);
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    if (best) {
      taken.add(keyOf(best.cell));
      tasks.push(taskFor(ctx, u, best.kind, best.cell, siteOrder(u.id, best), bestScore, -1));
      continue;
    }
    if (memo.res.has(u.id)) continue;
    const f = feedCell(ctx, taken);
    if (!f) continue;
    taken.add(keyOf(f));
    tasks.push(taskFor(ctx, u, 'feed', f, { kind: 'feed', unit: u.id, q: f.q, r: f.r }, 0.001, -1));
  }
  return tasks;
}
