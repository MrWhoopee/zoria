import { cfg } from '../map/valley.ts';
import { bytesFor, weightOf } from './types.ts';
import type { Ctx, Task } from './types.ts';

export function yard(ctx: Ctx): Task[] {
  const { v, w, memo, preset } = ctx;
  memo.pendingYard = memo.pendingYard.filter((eta) => eta > w.t);
  const pending = memo.pendingYard.length;
  const tkachs = w.units.filter((u) => u.cls === 'ткач').length + pending;
  const cost = cfg(v, 'costTkach');
  const weight = weightOf(v, w.units) + pending * cfg(v, 'weightTkach');
  if (tkachs >= preset.tkachTarget || weight + cfg(v, 'weightTkach') > cfg(v, 'squadWeight') || w.energy < cost) return [];
  const eta = cfg(v, 'droneBuild') + 1;
  return [
    {
      tag: 'yard',
      unit: null,
      order: { kind: 'yard', cls: 'ткач' },
      value: 1e6,
      bytes: bytesFor(ctx, 'yard', v.base),
      energy: cost,
      commit: (m, t) => {
        m.pendingYard.push(t + eta);
      },
      refused: (m) => {
        m.pendingYard.pop();
      },
    },
  ];
}
