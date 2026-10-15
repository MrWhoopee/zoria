import { orderCost } from '@zoria/protocol';
import type { ChannelCfg } from '@zoria/protocol';
import { disc, dist, keyOf } from '../hex.ts';
import type { Cell } from '../hex.ts';
import { cfg, inside } from '../map/valley.ts';
import type { Valley } from '../map/valley.ts';
import type { Ctx, Task } from './types.ts';

export const SCOUT_REACH = 12;
export const SCOUT_AGE = 200;
export const SCOUT_FRESH = 15;
export const SCOUT_VALUE = 1.5;

const none = (): void => undefined;

const lattice = new WeakMap<Valley, Cell[]>();

export function centers(v: Valley): Cell[] {
  const known = lattice.get(v);
  if (known) return known;
  const rad = cfg(v, 'scanRad');
  const a = { q: 2 * rad + 1, r: -rad };
  const b = { q: rad, r: rad + 1 };
  const out: Cell[] = [];
  for (let i = -8; i <= 8; i++) {
    for (let j = -8; j <= 8; j++) {
      const c = { q: i * a.q + j * b.q, r: i * a.r + j * b.r };
      if (inside(v, c)) {
        out.push(c);
        continue;
      }
      const near = disc(c, rad)
        .filter((x) => inside(v, x))
        .sort((x, y) => dist(x, c) - dist(y, c) || keyOf(x).localeCompare(keyOf(y)))[0];
      if (near) out.push(near);
    }
  }
  lattice.set(v, out);
  return out;
}

function contract(ctx: Ctx): Cell | null {
  const { w, memo, preset } = ctx;
  const order = w.order;
  if (preset.orderJam <= 0 || !order || w.t > order.to) return null;
  const first = order.cells[0];
  if (!first || w.t - (memo.scans.get(keyOf(first)) ?? -Infinity) < SCOUT_FRESH) return null;
  return first;
}

function survey(ctx: Ctx): Cell | null {
  const { v, w, memo } = ctx;
  const lit = w.ownLit();
  const anchors = [v.base, ...lit];
  const rad = cfg(v, 'scanRad');
  let best: Cell | null = null;
  let bestScore = 0;
  for (const c of centers(v)) {
    if (!anchors.some((a) => dist(a, c) <= SCOUT_REACH)) continue;
    if (lit.some((n) => dist(n, c) <= 1)) continue;
    const age = Math.min(SCOUT_AGE, w.t - (memo.scans.get(keyOf(c)) ?? -Infinity));
    let interest = 1;
    for (const x of disc(c, rad)) {
      const o = w.owner.get(keyOf(x));
      if (o === undefined || o === v.slot) continue;
      interest += o === null ? 0.5 : o === 'K' ? 0 : 1;
    }
    const score = age * interest;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export function scout(ctx: Ctx): Task[] {
  const { v, w, preset } = ctx;
  if (preset.scout <= 0) return [];
  const target = contract(ctx) ?? survey(ctx);
  if (!target) return [];
  const rad = cfg(v, 'scanRad');
  const cost = orderCost(v.cfg as unknown as ChannelCfg, 'scan', target, w.t, v.storms);
  if (w.ear < cost) return [];
  return [
    {
      tag: 'scout',
      unit: null,
      order: { kind: 'scan', q: target.q, r: target.r, rad },
      value: SCOUT_VALUE,
      bytes: 0,
      energy: 0,
      commit: (m, t) => {
        m.scans.set(keyOf(target), t);
      },
      refused: none,
    },
  ];
}
