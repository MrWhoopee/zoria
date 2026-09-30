import type { Task } from './plans/types.ts';

export interface Budget {
  chan: number;
  cap: number;
  energy: number;
}

export function allocate(tasks: Task[], b: Budget): Task[] {
  let chan = b.chan;
  let energy = b.energy;
  const used = new Set<string>();
  const out: Task[] = [];
  for (const task of [...tasks].sort((x, y) => y.value - x.value)) {
    if (out.length >= b.cap) break;
    if (task.unit !== null && used.has(task.unit)) continue;
    if (task.bytes > chan || task.energy > energy) continue;
    chan -= task.bytes;
    energy -= task.energy;
    if (task.unit !== null) used.add(task.unit);
    out.push(task);
  }
  return out;
}
