import type { MineUnit } from '@zoria/protocol';
import type { Task } from './plans/types.ts';

export interface Budget {
  chan: number;
  busyHands: number;
  cap: number;
  energy: number;
}

export function busyHands(units: MineUnit[], chanTick: number): number {
  return units.filter((u) => u.task !== null || u.work > 0).length * chanTick;
}

export function allocate(tasks: Task[], b: Budget): Task[] {
  let chan = b.chan - b.busyHands;
  let energy = b.energy;
  const used = new Set<string>();
  const out: Task[] = [];
  for (const task of [...tasks].sort((x, y) => y.value - x.value)) {
    if (out.length >= b.cap) break;
    if (task.unit !== null && used.has(task.unit)) continue;
    const need = task.bytes + task.hands;
    if (need > chan || task.energy > energy) continue;
    chan -= need;
    energy -= task.energy;
    if (task.unit !== null) used.add(task.unit);
    out.push(task);
  }
  return out;
}
