import type { ActorName, MineUnit, Order } from '@zoria/protocol';
import { disc, dist, keyOf, parse } from '../hex.ts';
import type { Cell } from '../hex.ts';
import { pullOf, share } from '../map/coverage.ts';
import type { Pull, Source } from '../map/coverage.ts';
import { travelField } from '../map/travel.ts';
import { cfg, inside, price, typeAt } from '../map/valley.ts';
import { bytesFor, midStep } from './types.ts';
import type { Ctx, Reservation, Task } from './types.ts';

export const JAM_REACH = 24;
export const JAM_SPAN = 60;
export const JAM_TTL = 240;
export const LOOT_GRACE = 8;
export const JAM_AWAY = 28;
export const JAM_BAN = 120;

interface Target {
  cell: Cell;
  owner: ActorName;
  perTick: number;
}

const none = (): void => undefined;

function leader(ctx: Ctx): ActorName | null {
  const lead = ctx.w.leader();
  return lead === ctx.v.slot ? null : lead;
}

function foeNet(ctx: Ctx, owner: ActorName): Cell[] {
  const { w } = ctx;
  const out: Cell[] = [];
  for (const [k, o] of w.owner) if (o === owner && w.dark.get(k) !== true) out.push(parse(k));
  return out;
}

function reached(ctx: Ctx, owner: ActorName, net: Cell[], skip: string | null): Set<string> {
  const { v, links } = ctx;
  const seen = new Set<string>();
  const roots = v.starts.filter((s) => s.slot === owner).map((s) => s.cell);
  const queue = net.filter((c) => keyOf(c) !== skip && roots.some((r) => keyOf(r) === keyOf(c) || links.ok(r, c)));
  for (let c = queue.shift(); c; c = queue.shift()) {
    const k = keyOf(c);
    if (seen.has(k)) continue;
    seen.add(k);
    for (const n of net) if (!seen.has(keyOf(n)) && keyOf(n) !== skip && links.ok(c, n)) queue.push(n);
  }
  return seen;
}

export function tailOf(ctx: Ctx, owner: ActorName, cell: Cell): Cell[] {
  const net = foeNet(ctx, owner);
  const all = reached(ctx, owner, net, null);
  const k = keyOf(cell);
  if (!all.has(k)) return [];
  const rest = reached(ctx, owner, net, k);
  return net.filter((c) => all.has(keyOf(c)) && !rest.has(keyOf(c)) && keyOf(c) !== k);
}

export function jamGain(ctx: Ctx, cell: Cell, tail: Cell[], own: Pull, foe: Pull, weight: number): number {
  const { v } = ctx;
  const ringPull = cfg(v, 'ringPull');
  const mult = (c: Cell): number => (v.ringKeys.has(keyOf(c)) ? ringPull : 1);
  const gone: Source[] = [cell, ...tail].map((c) => ({ cell: c, mult: mult(c) }));
  const drop = pullOf(v, gone);
  const loot = pullOf(v, [{ cell, mult: mult(cell) * cfg(v, 'jamLoot') }]);
  let ours = 0;
  let theirs = 0;
  for (const [k, d] of drop) {
    const c = parse(k);
    if (!inside(v, c)) continue;
    const cost = price(v, c);
    const o = own.get(k) ?? 0;
    const f = foe.get(k) ?? 0;
    const l = loot.get(k) ?? 0;
    const f2 = Math.max(0, f - d);
    ours += cost * (share(o + l, f2) - share(o, f));
    theirs += cost * (share(f, o) - share(f2, o + l));
  }
  return ours + ctx.preset.harm * weight * theirs;
}

function standOf(ctx: Ctx, target: Cell, field: Map<string, number>, taken: Set<string>): { cell: Cell; eta: number } | null {
  const { v, w } = ctx;
  const guarded = w.t < v.dawnAt;
  let best: { cell: Cell; eta: number } | null = null;
  for (const c of disc(target, 1)) {
    const k = keyOf(c);
    if (!inside(v, c) || taken.has(k) || typeAt(v, c)?.pass !== true) continue;
    if (guarded && dist(c, v.citadel) <= v.cherta) continue;
    const eta = field.get(k);
    if (eta === undefined || eta > JAM_REACH) continue;
    if (!best || eta < best.eta || (eta === best.eta && k < keyOf(best.cell))) best = { cell: c, eta };
  }
  return best;
}

export function denyOf(ctx: Ctx, cell: Cell, owner: ActorName, eta: number): number {
  const { w, preset } = ctx;
  const order = w.order;
  if (preset.orderJam <= 0 || !order) return 0;
  const k = keyOf(cell);
  if (!order.cells.some((c) => keyOf(c) === k)) return 0;
  const owners = order.cells.map((c) => w.owner.get(keyOf(c)) ?? null);
  const held = owners.filter((o) => o === owner).length;
  if (held < 2 || owners.some((o) => o !== owner && o !== null)) return 0;
  if (w.t + eta > order.to) return 0;
  return (preset.orderJam * order.bonus * held) / order.cells.length;
}

function targets(ctx: Ctx, reserved: Set<string>): Target[] {
  const { v, w, memo } = ctx;
  const starts = new Set(v.starts.map((s) => keyOf(s.cell)));
  const lead = leader(ctx);
  const own = pullOf(v, w.ownLit().map((c) => ({ cell: c, mult: 1 })));
  const foe = pullOf(v, w.foeLit());
  const out: Target[] = [];
  for (const [k, o] of w.owner) {
    if (o === null || o === v.slot || o === 'K' || o === w.partner || starts.has(k) || reserved.has(k) || w.dark.get(k) === true) continue;
    if ((memo.banned.get('jam:' + k) ?? -1) > w.t) continue;
    const cell = parse(k);
    const weight = o === lead ? ctx.preset.jamLeader : 1;
    const perTick = jamGain(ctx, cell, tailOf(ctx, o, cell), own, foe, weight);
    if (perTick > 0 || denyOf(ctx, cell, o, 0) > 0) out.push({ cell, owner: o, perTick });
  }
  return out;
}

function task(ctx: Ctx, u: MineUnit, tag: string, order: Order, value: number, res: Reservation | null): Task {
  return {
    tag,
    unit: u.id,
    order,
    value,
    bytes: bytesFor(ctx, order.kind, u),
    energy: 0,
    commit: res ? (m, t) => m.res.set(u.id, { ...res, sent: t }) : none,
    refused: (m) => {
      if (res) {
        m.res.delete(u.id);
        m.banned.set('jam:' + keyOf(res.cell), ctx.w.t + JAM_BAN);
      }
    },
  };
}

function drop(ctx: Ctx, u: MineUnit, r: Reservation): Task {
  ctx.memo.res.delete(u.id);
  ctx.memo.banned.set('jam:' + keyOf(r.cell), ctx.w.t + JAM_BAN);
  return stop(ctx, u);
}

function stop(ctx: Ctx, u: MineUnit): Task {
  const home = ctx.w.ownLit()[0] ?? ctx.v.base;
  if (u.away > 0) return task(ctx, u, 'jam:home', { kind: 'move', unit: u.id, q: home.q, r: home.r, goal: null, home: true }, 2, null);
  return task(ctx, u, 'jam:stop', { kind: 'halt', unit: u.id }, 2, null);
}

function tend(ctx: Ctx, u: MineUnit, r: Reservation): Task | null {
  const { w } = ctx;
  const k = keyOf(r.cell);
  const stand = r.stand ?? r.cell;
  if (w.owner.get(k) !== r.owner || w.t - r.since > JAM_TTL || u.away >= JAM_AWAY) return drop(ctx, u, r);
  const near = dist(u, r.cell) <= 1;
  if (near && r.arrived === undefined) {
    r.arrived = w.t;
    r.mark = w.stolen;
  }
  if (near && r.arrived !== undefined && w.t - r.arrived > LOOT_GRACE && w.stolen <= (r.mark ?? 0)) return drop(ctx, u, r);
  if (near && r.arrived !== undefined && w.t - r.arrived > LOOT_GRACE) {
    r.arrived = w.t;
    r.mark = w.stolen;
  }
  const holding = u.task?.jam && u.task.jam.q === r.cell.q && u.task.jam.r === r.cell.r;
  if (near && !holding) return task(ctx, u, 'jam:hold', { kind: 'jam', unit: u.id, target: { q: r.cell.q, r: r.cell.r }, hold: true }, 3, r);
  if (!near && u.task === null && w.t - r.sent >= 6) return task(ctx, u, 'jam:go', { kind: 'move', unit: u.id, q: stand.q, r: stand.r, goal: null, home: false }, 3, r);
  return null;
}

function callOff(ctx: Ctx, klinoks: MineUnit[]): Task[] {
  const out: Task[] = [];
  for (const u of klinoks) {
    const r = ctx.memo.res.get(u.id);
    if (r?.kind === 'jam' && u.task?.ram) ctx.memo.res.delete(u.id);
    else if (r?.kind === 'jam') out.push(drop(ctx, u, r));
    else if (u.task?.jam) out.push(stop(ctx, u));
  }
  return out;
}

export function jam(ctx: Ctx): Task[] {
  const { v, w, memo, preset } = ctx;
  const klinoks = w.units.filter((u) => u.cls === 'клинок' && !u.stuck && !midStep(u)).sort((a, b) => (a.id < b.id ? -1 : 1));
  if (preset.jam <= 0) return callOff(ctx, klinoks);
  const tasks: Task[] = [];
  const busy = new Set<string>();
  for (const u of klinoks) {
    const r = memo.res.get(u.id);
    if (r?.kind !== 'jam') continue;
    busy.add(u.id);
    if (u.task?.ram) {
      memo.res.delete(u.id);
      continue;
    }
    const t = tend(ctx, u, r);
    if (t) tasks.push(t);
  }
  const all = w.units.filter((u) => u.cls === 'клинок').length;
  const jamming = [...memo.res.values()].filter((r) => r.kind === 'jam').length;
  const room = all - preset.jamHome - jamming;
  if (room <= 0) return tasks;
  const acting = w.units.filter((u) => u.task !== null || u.work > 0).length + jamming;
  const spare = w.chanAt - acting * cfg(v, 'chanTick') - jamming * cfg(v, 'jamKeep');
  if (spare < cfg(v, 'jamStart') + cfg(v, 'chanTick')) return tasks;
  const free = klinoks.filter((u) => !busy.has(u.id) && u.task === null && !memo.res.has(u.id));
  if (free.length === 0) return tasks;
  const reserved = new Set([...memo.res.values()].filter((r) => r.kind === 'jam').map((r) => keyOf(r.cell)));
  const found = targets(ctx, reserved);
  if (found.length === 0) return tasks;
  const rate = cfg(v, 'minuteRate');
  const left = v.ticks - w.t;
  const stands = new Set<string>();
  let n = 0;
  for (const u of free) {
    if (n >= room) break;
    const field = travelField(v, u, 'клинок');
    let best: { t: Target; stand: Cell; score: number } | null = null;
    for (const t of found) {
      if (reserved.has(keyOf(t.cell))) continue;
      const s = standOf(ctx, t.cell, field, stands);
      if (!s) continue;
      const span = Math.min(JAM_SPAN, left - s.eta);
      if (span <= 0) continue;
      const score = (Math.max(0, t.perTick) * rate * span + denyOf(ctx, t.cell, t.owner, s.eta)) / Math.pow(s.eta + 1, preset.etaPower);
      if (score <= 0) continue;
      if (!best || score > best.score) best = { t, stand: s.cell, score };
    }
    if (!best) continue;
    n++;
    reserved.add(keyOf(best.t.cell));
    stands.add(keyOf(best.stand));
    const res: Reservation = { kind: 'jam', cell: best.t.cell, since: w.t, sent: w.t, owner: best.t.owner, stand: best.stand };
    const near = dist(u, best.t.cell) <= 1;
    const order: Order = near
      ? { kind: 'jam', unit: u.id, target: { q: best.t.cell.q, r: best.t.cell.r }, hold: true }
      : { kind: 'move', unit: u.id, q: best.stand.q, r: best.stand.r, goal: null, home: false };
    tasks.push(task(ctx, u, near ? 'jam:hold' : 'jam:go', order, best.score, res));
  }
  return tasks;
}
