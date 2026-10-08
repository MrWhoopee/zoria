import type { MineUnit } from '@zoria/protocol';
import { parse } from '../hex.ts';
import { travelField } from '../map/travel.ts';
import { bytesFor, midStep } from './types.ts';
import type { Ctx, Task } from './types.ts';

export const LOOT_VALUE = 50;
export const LOOT_SETTLE = 3;

const none = (): void => undefined;

export function loot(ctx: Ctx): Task[] {
  const { v, w, memo, preset } = ctx;
  if (preset.cache <= 0) return [];
  const alive = new Map(w.units.map((u) => [u.id, u]));
  for (const [k, run] of memo.loot) {
    const u = alive.get(run.unit);
    if (!w.caches.has(k) || !u || (u.task === null && w.t - run.sent > LOOT_SETTLE)) memo.loot.delete(k);
  }
  if (w.caches.size === 0) return [];
  const busy = new Set([...memo.loot.values()].map((r) => r.unit));
  const free = w.units.filter((u) => u.cls === 'клинок' && u.task === null && !u.stuck && !midStep(u) && !memo.res.has(u.id) && !busy.has(u.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
  if (free.length === 0) return [];
  const fields = new Map(free.map((u) => [u.id, travelField(v, u, 'клинок')]));
  const tasks: Task[] = [];
  const used = new Set<string>();
  for (const k of [...w.caches].sort()) {
    if (memo.loot.has(k)) continue;
    let best: { u: MineUnit; eta: number } | null = null;
    for (const u of free) {
      if (used.has(u.id)) continue;
      const eta = fields.get(u.id)?.get(k);
      if (eta === undefined || eta > preset.cache) continue;
      if (!best || eta < best.eta) best = { u, eta };
    }
    if (!best) continue;
    const unit = best.u.id;
    used.add(unit);
    const cell = parse(k);
    tasks.push({
      tag: 'loot',
      unit,
      order: { kind: 'move', unit, q: cell.q, r: cell.r, goal: null, home: false },
      value: LOOT_VALUE - best.eta / 100,
      bytes: bytesFor(ctx, 'move', best.u),
      energy: 0,
      commit: (m, t) => m.loot.set(k, { unit, sent: t }),
      refused: none,
    });
  }
  return tasks;
}
