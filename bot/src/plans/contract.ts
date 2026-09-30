import { keyOf } from '../hex.ts';
import type { Cell } from '../hex.ts';
import type { Ctx } from './types.ts';

export function contractExtra(ctx: Ctx, site: Cell, eta: number): number {
  const { w, v, preset } = ctx;
  const order = w.order;
  if (!order || preset.contract <= 0) return 0;
  const k = keyOf(site);
  if (!order.cells.some((c) => keyOf(c) === k)) return 0;
  if (w.t + eta + order.holdTicks > order.to) return 0;
  const lit = new Set(w.ownLit().map(keyOf));
  const needed = order.cells.filter((c) => !lit.has(keyOf(c))).length;
  return (order.bonus * preset.contract) / Math.max(1, needed);
}
