import type { Order, SlotName } from '@zoria/protocol';
import { bytesFor } from './types.ts';
import type { Ctx, Task } from './types.ts';

export const PACT_MIN = 10;
export const PACT_VALUE = 5;

const none = (): void => undefined;

function task(ctx: Ctx, tag: string, order: Order): Task {
  return { tag, unit: null, order, value: PACT_VALUE, bytes: bytesFor(ctx, order.kind, ctx.v.base), energy: 0, commit: none, refused: none };
}

export function behind(ctx: Ctx, lead: SlotName): boolean {
  const { v, w, preset } = ctx;
  const gap = w.scoreOf(lead) - w.scoreOf(v.slot);
  return gap >= PACT_MIN && gap >= preset.pactGap * w.scoreOf(lead);
}

export function pact(ctx: Ctx): Task[] {
  const { v, w, preset } = ctx;
  if (preset.pact <= 0) return [];
  const me = v.slot;
  const lead = w.leader();
  if (w.partner) {
    if (!w.breaking && (lead === me || lead === w.partner)) return [task(ctx, 'pact:break', { kind: 'pact', op: 'break', to: w.partner })];
    return [];
  }
  if (lead === me || !behind(ctx, lead)) return [];
  const from = w.offers.find((s) => s !== lead);
  if (from) return [task(ctx, 'pact:accept', { kind: 'pact', op: 'accept', to: from })];
  const other = (['A', 'B', 'C'] as const).find((s) => s !== me && s !== lead);
  if (!other || w.offersLeft <= 0 || w.offered.includes(other)) return [];
  return [task(ctx, 'pact:offer', { kind: 'pact', op: 'offer', to: other })];
}
