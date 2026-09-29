import { cfg } from '../map/valley.ts';
import { bytesFor } from './types.ts';
import type { Ctx, Task } from './types.ts';

export const KEEPALIVE_GAP = 4;

const none = (): void => undefined;

export function keepalive(ctx: Ctx, chosen: Task[] = []): Task | null {
  const { v, w, memo } = ctx;
  if (w.t - memo.lastAccepted < KEEPALIVE_GAP) return null;
  const busy = new Set(chosen.map((t) => t.unit));
  const idle = w.units.find((u) => u.task === null && u.wait === 0 && !memo.res.has(u.id) && !busy.has(u.id));
  if (idle && w.chan >= cfg(v, 'chanOrder')) {
    return { tag: 'keepalive', unit: idle.id, order: { kind: 'halt', unit: idle.id }, value: 0, bytes: 0, hands: 0, energy: 0, commit: none, refused: none };
  }
  return {
    tag: 'keepalive',
    unit: null,
    order: { kind: 'watch', q: v.base.q, r: v.base.r, keep: 0 },
    value: 0,
    bytes: bytesFor(ctx, 'watch', v.base),
    hands: 0,
    energy: 0,
    commit: none,
    refused: none,
  };
}
