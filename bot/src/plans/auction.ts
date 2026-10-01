import type { Cell } from '../hex.ts';
import { keyOf } from '../hex.ts';
import { cfg } from '../map/valley.ts';
import { bytesFor } from './types.ts';
import type { Ctx, Task } from './types.ts';

export const BID_WINDOW = 3;
const RESERVE = 60;

function usable(ctx: Ctx, cells: Cell[]): number {
  const { v, w, links } = ctx;
  const anchors = [v.base, ...w.ownLit()];
  const free = cells.filter((c) => (w.owner.get(keyOf(c)) ?? null) === null);
  const linked = free.filter((c) => links.reach(c, anchors));
  if (linked.length === 0) return 0;
  return free.filter((c) => linked.includes(c) || links.reach(c, [...anchors, ...linked])).length;
}

export function auction(ctx: Ctx): Task[] {
  const { v, w, memo, preset } = ctx;
  if (preset.auction <= 0) return [];
  const i = v.lots.findIndex((l) => l.at - w.t >= 1 && l.at - w.t <= BID_WINDOW);
  const lot = v.lots[i];
  if (!lot) return [];
  const n = usable(ctx, lot.cells);
  const building = w.units.filter((u) => u.cls === 'ткач' && u.work > 0).length;
  const amount = Math.floor(Math.min(preset.auction * cfg(v, 'costNeedle') * n, w.energy - building * cfg(v, 'costNeedle')));
  if (n === 0 || amount < RESERVE || memo.bids.get(i) === amount) return [];
  return [
    {
      tag: 'auction',
      unit: null,
      order: { kind: 'bid', lot: i, amount },
      value: 1e5,
      bytes: bytesFor(ctx, 'bid', v.base),
      energy: amount,
      commit: (m) => {
        m.bids.set(i, amount);
      },
      refused: (m) => {
        m.bids.delete(i);
      },
    },
  ];
}
