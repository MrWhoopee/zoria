import type { ClsName } from '@zoria/protocol';
import { cfg } from '../map/valley.ts';
import { bytesFor, weightOf } from './types.ts';
import type { Ctx, Task } from './types.ts';

export function yard(ctx: Ctx): Task[] {
  const { v, w, memo, preset } = ctx;
  memo.pendingYard = memo.pendingYard.filter((p) => p.eta > w.t);
  const count = (cls: ClsName): number => w.units.filter((u) => u.cls === cls).length + memo.pendingYard.filter((p) => p.cls === cls).length;
  const weightOfCls = (cls: ClsName): number => cfg(v, cls === 'ткач' ? 'weightTkach' : 'weightKlinok');
  const weight = weightOf(v, w.units) + memo.pendingYard.reduce((s, p) => s + weightOfCls(p.cls), 0);
  const cls: ClsName | null = count('ткач') < preset.tkachTarget ? 'ткач' : count('клинок') < preset.klinokTarget ? 'клинок' : null;
  if (cls === null) return [];
  const cost = cfg(v, cls === 'ткач' ? 'costTkach' : 'costKlinok');
  if (weight + weightOfCls(cls) > cfg(v, 'squadWeight') || w.energy < cost) return [];
  const eta = cfg(v, 'droneBuild') + 1;
  return [
    {
      tag: 'yard',
      unit: null,
      order: { kind: 'yard', cls },
      value: 1e6,
      bytes: bytesFor(ctx, 'yard', v.base),
      energy: cost,
      commit: (m, t) => {
        m.pendingYard.push({ cls, eta: t + eta });
      },
      refused: (m) => {
        m.pendingYard.pop();
      },
    },
  ];
}
