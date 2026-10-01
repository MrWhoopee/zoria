import type { MineUnit } from '@zoria/protocol';
import { dist, keyOf } from '../hex.ts';
import type { Cell } from '../hex.ts';
import { cfg } from '../map/valley.ts';
import { bytesFor, midStep } from './types.ts';
import type { Ctx, Task } from './types.ts';

export const GUARD_VALUE = 5e4;
export const POST_SLACK = 2;
export const RAM_MARGIN = 2;

const none = (): void => undefined;

function postCell(ctx: Ctx): Cell | null {
  const lit = ctx.w.ownLit();
  const range = cfg(ctx.v, 'linkRange');
  let best: Cell | null = null;
  let bestN = -1;
  for (const c of lit) {
    const n = lit.filter((x) => dist(x, c) <= range).length;
    if (n > bestN || (n === bestN && best !== null && keyOf(c) < keyOf(best))) {
      bestN = n;
      best = c;
    }
  }
  return best;
}

function task(ctx: Ctx, u: MineUnit, tag: string, order: Task['order'], value: number): Task {
  return { tag, unit: u.id, order, value, bytes: bytesFor(ctx, order.kind, u), energy: 0, commit: none, refused: none };
}

export function guard(ctx: Ctx): Task[] {
  const { v, w } = ctx;
  const klinoks = w.units.filter((u) => u.cls === 'клинок' && !midStep(u) && !u.stuck);
  if (klinoks.length === 0) return [];
  const starts = new Set(v.starts.map((s) => keyOf(s.cell)));
  const { preset } = ctx;
  const grace = preset.ramGrace > 0 ? cfg(v, 'capGrace') : 0;
  const heatable = new Set(w.mine.map((n) => keyOf(n)).filter((k) => !starts.has(k) && w.t - (w.since.get(k) ?? w.t) >= grace));
  const chasing = new Set(w.units.flatMap((k) => (k.cls === 'клинок' && k.task?.ram ? [k.task.ram] : [])));
  const dark = w.mine.filter((n) => n.dark);
  const heaters = w.foe.filter((f) => f.cls === 'ткач' && heatable.has(keyOf(f)) && w.stillFor(f.id) >= preset.ramStill);
  const jammers = preset.ramJammers > 0 ? w.foe.filter((f) => f.cls === 'клинок' && dark.some((n) => dist(n, f) <= 1)) : [];
  const lit = preset.ramIntruders > 0 ? w.ownLit() : [];
  const range = cfg(v, 'linkRange');
  const intruders = w.foe.filter((f) => f.cls === 'ткач' && !heatable.has(keyOf(f)) && w.stillFor(f.id) >= 1 && (w.owner.get(keyOf(f)) ?? null) !== f.p && lit.some((n) => dist(n, f) <= range));
  const fair = (f: (typeof w.foe)[number]): boolean => f.p !== v.slot && f.p !== 'K' && f.p !== w.partner && !chasing.has(f.id);
  const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);
  const threats = [...[...heaters, ...jammers].filter(fair).sort(byId), ...intruders.filter(fair).sort(byId)];
  const tasks: Task[] = [];
  const used = new Set<string>();
  for (const k of klinoks) {
    const id = k.task?.ram;
    if (!id || preset.chaseOff === 0) continue;
    const f = w.foe.find((x) => x.id === id);
    if (f && heatable.has(keyOf(f))) continue;
    used.add(k.id);
    tasks.push(task(ctx, k, 'guard:off', { kind: 'halt', unit: k.id }, GUARD_VALUE));
  }
  for (const f of threats) {
    const heat = cfg(v, w.dark.get(keyOf(f)) === true ? 'heatDark' : 'heatEnemy');
    const inTime = (k: Cell): boolean => preset.ramTiming === 0 || w.stillFor(f.id) + dist(k, f) + RAM_MARGIN < heat;
    const free = klinoks.filter((k) => !used.has(k.id) && !k.task?.ram && inTime(k)).sort((a, b) => dist(a, f) - dist(b, f) || a.id.localeCompare(b.id));
    const k = free[0];
    if (!k) break;
    used.add(k.id);
    tasks.push(task(ctx, k, 'guard:ram', { kind: 'ram', unit: k.id, target: f.id }, GUARD_VALUE - dist(k, f)));
  }
  const post = postCell(ctx);
  if (!post) return tasks;
  for (const k of klinoks) {
    if (used.has(k.id) || k.task !== null || dist(k, post) <= POST_SLACK) continue;
    tasks.push(task(ctx, k, 'guard:post', { kind: 'move', unit: k.id, q: post.q, r: post.r, goal: null, home: true }, 0.01));
  }
  return tasks;
}
