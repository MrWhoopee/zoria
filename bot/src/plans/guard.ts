import type { MineUnit } from '@zoria/protocol';
import { dist, keyOf } from '../hex.ts';
import type { Cell } from '../hex.ts';
import { cfg } from '../map/valley.ts';
import { bytesFor, midStep } from './types.ts';
import type { Ctx, Task } from './types.ts';

export const GUARD_VALUE = 5e4;
export const POST_SLACK = 2;

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
  const mine = w.mine.map((n) => ({ q: n.q, r: n.r }));
  const chasing = new Set(klinoks.flatMap((k) => (k.task?.ram ? [k.task.ram] : [])));
  const threats = w.foe
    .filter((f) => f.cls === 'ткач' && f.p !== v.slot && f.p !== 'K' && !chasing.has(f.id))
    .map((f) => ({ f, d: Math.min(...mine.map((c) => dist(c, f))) }))
    .filter((x) => x.d <= 1)
    .sort((a, b) => a.d - b.d || a.f.id.localeCompare(b.f.id));
  const tasks: Task[] = [];
  const used = new Set<string>();
  for (const { f } of threats) {
    const free = klinoks.filter((k) => !used.has(k.id) && !k.task?.ram).sort((a, b) => dist(a, f) - dist(b, f) || a.id.localeCompare(b.id));
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
