import type { ActorName, MineUnit, Order } from '@zoria/protocol';
import { disc, dist, keyOf, parse } from '../hex.ts';
import type { Cell } from '../hex.ts';
import { gain, pullOf, takeGain } from '../map/coverage.ts';
import type { Pull } from '../map/coverage.ts';
import { travelField } from '../map/travel.ts';
import { cfg, inside, price, typeAt } from '../map/valley.ts';
import { bytesFor, midStep } from './types.ts';
import type { Ctx, Reservation, Task } from './types.ts';

export const RESERVE_TTL = 200;
export const REISSUE_GAP = 6;
export const AWAY_LIMIT = 32;
export const HEAT_SLACK = 12;
export const BAN_TICKS = 80;
export const REFUSE_BAN = 150;
const BANNING = new Set([11, 12, 21]);

export function banned(ctx: Ctx, k: string): boolean {
  return (ctx.memo.banned.get(k) ?? -1) > ctx.w.t;
}

interface Site {
  cell: Cell;
  kind: 'take' | 'build';
  gain: number;
  work: number;
  owner: ActorName | null;
}

export function release(ctx: Ctx): void {
  const { w, memo, v } = ctx;
  const alive = new Map(w.units.map((u) => [u.id, u]));
  for (const [id, r] of memo.res) {
    const unit = alive.get(id);
    if (r.kind === 'home') {
      if (!unit || unit.away === 0) memo.res.delete(id);
      continue;
    }
    const o = w.owner.get(keyOf(r.cell));
    const done = r.kind !== 'feed' && o === v.slot;
    const was = r.owner ?? null;
    const gone = r.kind === 'take' ? o !== was && o !== v.slot : r.kind === 'build' ? o !== undefined && o !== v.slot : o !== v.slot;
    if (!unit || done || gone || w.t - r.since > RESERVE_TTL) memo.res.delete(id);
  }
}

function buildable(ctx: Ctx, c: Cell): boolean {
  const { v, w } = ctx;
  const t = typeAt(v, c);
  const k = keyOf(c);
  if (!t || !t.pass || !t.build || w.owner.has(k) || v.dead.has(k)) return false;
  return Object.values(v.seats).every((s) => dist(s, c) > 2);
}

export function unlockValue(ctx: Ctx, site: Cell, anchors: Cell[], own: Pull, foe: Pull): number {
  const { v, w, links } = ctx;
  const range = cfg(v, 'linkRange') + 1;
  let total = 0;
  for (const r of v.ruins) {
    if (dist(r, site) > range || w.owner.get(keyOf(r)) !== null) continue;
    if (!links.ok(site, r) || links.reach(r, anchors)) continue;
    total += gain(v, r, own, foe);
  }
  return total;
}

function cutNeedles(ctx: Ctx, anchors: Cell[]): Cell[] {
  return ctx.w.mine.filter((n) => n.dark).map((n) => ({ q: n.q, r: n.r })).filter((c) => !ctx.links.reach(c, anchors));
}

export function reconnectValue(ctx: Ctx, site: Cell, anchors: Cell[], own: Pull, foe: Pull, cut: Cell[] = cutNeedles(ctx, anchors)): number {
  const { v, links } = ctx;
  if (cut.length === 0) return 0;
  const reached = new Set<string>();
  const queue = cut.filter((c) => links.ok(site, c));
  let total = 0;
  for (let c = queue.shift(); c; c = queue.shift()) {
    const k = keyOf(c);
    if (reached.has(k)) continue;
    reached.add(k);
    total += gain(v, c, own, foe);
    for (const n of cut) if (!reached.has(keyOf(n)) && links.ok(c, n)) queue.push(n);
  }
  return total;
}

export function sites(ctx: Ctx, anchors: Cell[], own: Pull, foe: Pull, reserved: Set<string>): Site[] {
  const { v, w, links, memo, preset } = ctx;
  const out: Site[] = [];
  const guarded = w.t < v.dawnAt;
  const free = (k: string): boolean => !reserved.has(k) && !banned(ctx, k) && !(guarded && dist(parse(k), v.citadel) <= v.cherta);
  const starts = new Set(v.starts.map((s) => keyOf(s.cell)));
  const cut = cutNeedles(ctx, anchors);
  const back = (c: Cell): number => preset.repair * reconnectValue(ctx, c, anchors, own, foe, cut);
  for (const [k, o] of w.owner) {
    if (o === v.slot || starts.has(k) || !free(k)) continue;
    const keeper = o === 'K';
    if (keeper && w.t < v.dawnAt) continue;
    if (o !== null && !keeper && preset.steal === 0) continue;
    const c = parse(k);
    if (!links.reach(c, anchors)) continue;
    if (o === null) {
      out.push({ cell: c, kind: 'take', gain: gain(v, c, own, foe) + back(c), work: cfg(v, 'heatNeedle'), owner: null });
      continue;
    }
    const dark = keeper || w.dark.get(k) === true;
    const mult = dark ? 0 : 1;
    const work = keeper ? cfg(v, 'heatNeedle') : dark ? cfg(v, 'heatDark') : cfg(v, 'heatEnemy');
    out.push({ cell: c, kind: 'take', gain: takeGain(v, c, own, foe, mult, preset.harm) + back(c), work, owner: o });
  }
  const tkachs = w.units.filter((u) => u.cls === 'ткач').length;
  const need = cfg(v, 'costNeedle') + preset.buildReserve + (tkachs < preset.tkachTarget ? cfg(v, 'costTkach') : 0);
  if (w.energy >= need) {
    const seen = new Set<string>();
    const range = cfg(v, 'linkRange');
    for (const a of anchors) {
      for (const c of disc(a, range)) {
        const k = keyOf(c);
        if (seen.has(k) || dist(a, c) < 3) continue;
        seen.add(k);
        if (!inside(v, c) || !free(k) || !buildable(ctx, c) || !links.reach(c, anchors)) continue;
        const value = gain(v, c, own, foe) + preset.unlock * unlockValue(ctx, c, anchors, own, foe) + back(c);
        out.push({ cell: c, kind: 'build', gain: value, work: cfg(v, 'buildTicks'), owner: null });
      }
    }
  }
  return out.filter((s) => s.gain > 0);
}

interface Claim {
  kind: Reservation['kind'];
  cell: Cell;
  owner: ActorName | null;
  work: number;
}

function claimOrder(unit: string, c: Claim): Order {
  if (c.kind === 'take') return { kind: 'move', unit, q: c.cell.q, r: c.cell.r, goal: { q: c.cell.q, r: c.cell.r }, home: false };
  if (c.kind === 'build') return { kind: 'needle', unit, q: c.cell.q, r: c.cell.r };
  if (c.kind === 'feed') return { kind: 'feed', unit, q: c.cell.q, r: c.cell.r };
  return { kind: 'move', unit, q: c.cell.q, r: c.cell.r, goal: null, home: false };
}

function taskFor(ctx: Ctx, u: MineUnit, c: Claim, value: number, since: number): Task {
  const k = keyOf(c.cell);
  const order = claimOrder(u.id, c);
  const until = ctx.w.t + REFUSE_BAN;
  return {
    tag: 'expand:' + c.kind,
    unit: u.id,
    order,
    value,
    bytes: bytesFor(ctx, order.kind, u),
    energy: 0,
    commit: (m, t) => {
      m.res.set(u.id, { kind: c.kind, cell: c.cell, since: since < 0 ? t : since, sent: t, owner: c.owner, work: c.work });
    },
    refused: (m, code) => {
      m.res.delete(u.id);
      if (BANNING.has(code)) m.banned.set(k, until);
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

function nearestHome(anchors: Cell[], u: Cell): Cell {
  let best = anchors[0] ?? u;
  for (const a of anchors) if (dist(a, u) < dist(best, u)) best = a;
  return best;
}

function walkHome(ctx: Ctx, u: MineUnit): number {
  const anchors = [ctx.v.base, ...ctx.w.ownLit()];
  const home = nearestHome(anchors, u);
  return Math.max(0, dist(home, u) - 3) * cfg(ctx.v, 'stepTkach');
}

function leashRisk(ctx: Ctx, u: MineUnit): boolean {
  const r = ctx.memo.res.get(u.id);
  const autonomy = cfg(ctx.v, 'autonomy');
  if (r && r.kind !== 'feed' && u.q === r.cell.q && u.r === r.cell.r) {
    const left = (r.work ?? 0) - (ctx.w.t - (r.arrived ?? ctx.w.t));
    return u.away > 0 && u.away + Math.max(0, left) >= autonomy - 2;
  }
  return u.away >= AWAY_LIMIT || (u.away > 0 && u.away + walkHome(ctx, u) >= autonomy - 4);
}

function overstayed(ctx: Ctx, u: MineUnit): void {
  const { w, memo } = ctx;
  const r = memo.res.get(u.id);
  if (!r || r.kind !== 'take' || u.q !== r.cell.q || u.r !== r.cell.r) return;
  if (r.arrived === undefined) {
    r.arrived = w.t;
    return;
  }
  if (w.t - r.arrived <= (r.work ?? 0) + HEAT_SLACK) return;
  memo.res.delete(u.id);
  memo.banned.set(keyOf(r.cell), w.t + BAN_TICKS);
}

export function expand(ctx: Ctx): Task[] {
  const { v, w, memo } = ctx;
  release(ctx);
  const lit = w.ownLit();
  const anchors = [v.base, ...lit];
  const tasks: Task[] = [];
  const ready = w.units.filter((u) => u.cls === 'ткач' && !midStep(u) && !u.stuck).sort((a, b) => (a.id < b.id ? -1 : 1));
  const leashed = new Set<string>();
  for (const u of ready) {
    overstayed(ctx, u);
    const r = memo.res.get(u.id);
    if (r?.kind !== 'home' && leashRisk(ctx, u)) {
      leashed.add(u.id);
      const home = nearestHome(lit.length > 0 ? lit : [v.base], u);
      tasks.push(taskFor(ctx, u, { kind: 'home', cell: home, owner: null, work: 0 }, 1e5, -1));
      continue;
    }
    if (!r || r.kind === 'feed' || u.task !== null || w.t - r.sent < REISSUE_GAP) continue;
    if (r.kind === 'take' && u.q === r.cell.q && u.r === r.cell.r) continue;
    tasks.push(taskFor(ctx, u, { kind: r.kind, cell: r.cell, owner: r.owner ?? null, work: r.work ?? 0 }, 1, r.since));
  }
  const free = ready.filter((u) => {
    const r = memo.res.get(u.id);
    return !leashed.has(u.id) && (!r || r.kind === 'feed');
  });
  if (free.length === 0) return tasks;
  const own = pullOf(v, lit.map((c) => ({ cell: c, mult: 1 })));
  const foe = pullOf(v, w.foeLit());
  const reserved = new Set([...memo.res.values()].map((r) => keyOf(r.cell)));
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
      const eta = travel + s.work;
      const score = (s.gain * rate * Math.max(0, left - eta)) / Math.pow(eta + 1, ctx.preset.etaPower);
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    if (best) {
      taken.add(keyOf(best.cell));
      tasks.push(taskFor(ctx, u, { kind: best.kind, cell: best.cell, owner: best.owner, work: best.work }, bestScore, -1));
      continue;
    }
    if (memo.res.has(u.id) || !ctx.preset.feed) continue;
    const f = feedCell(ctx, taken);
    if (!f) continue;
    taken.add(keyOf(f));
    tasks.push(taskFor(ctx, u, { kind: 'feed', cell: f, owner: null, work: 0 }, 0.001, -1));
  }
  return tasks;
}
