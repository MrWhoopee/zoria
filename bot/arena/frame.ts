import type { ClsName, Observe, SlotName } from '@zoria/protocol';
import type { DecisionRecord } from '../src/decisions.ts';
import type { General } from '../src/general.ts';
import type { Cell } from '../src/hex.ts';
import type { World } from '../src/world.ts';

export interface ArenaMap {
  slot: SlotName;
  cells: [number, number, string, number][];
  seats: Record<SlotName, Cell>;
  ring: Cell[];
  starts: Cell[];
}

export interface ArenaUnit {
  id: string;
  cls: ClsName;
  q: number;
  r: number;
  manual: boolean;
  goal: number | null;
  task: string;
}

export interface ArenaGoal {
  id: number;
  kind: string;
  cell: Cell | null;
  target: string | null;
  unit: string | null;
}

export interface ArenaFrame {
  t: number;
  done: boolean;
  score: [number, number, number];
  place: number;
  energy: number;
  chan: number;
  chanAt: number;
  own: Record<string, string | null>;
  dark: Record<string, boolean>;
  foe: [string, string, string, number, number][];
  units: ArenaUnit[];
  goals: ArenaGoal[];
  yardNext: ClsName | null;
  notes: string[];
  decisions: { tag: string; unit: string | null; order: string }[];
}

export interface RevealFrame {
  own: Record<string, string | null>;
  units: [string, string, string, number, number][];
}

const SLOTS: SlotName[] = ['A', 'B', 'C'];

export function taskOf(u: Pick<World['units'][number], 'task'>): string {
  const t = u.task;
  if (!t) return 'idle';
  if (t.jam) return 'jam';
  if (t.ram) return 'ram';
  if (t.site) return 'build';
  if (t.home) return 'home';
  if (t.path > 0) return 'move';
  return 'idle';
}

export function frameOf(slot: SlotName, w: World, obs: Observe, g: General, d: DecisionRecord | null, done: boolean): ArenaFrame {
  const score = obs.pub.score;
  const mine = score[SLOTS.indexOf(slot)] ?? 0;
  const own: Record<string, string | null> = {};
  const dark: Record<string, boolean> = {};
  for (const [k, o] of w.owner) {
    own[k] = o;
    if (w.dark.get(k) === true) dark[k] = true;
  }
  const goalOf = new Map(g.goals.flatMap((x) => (x.unit ? [[x.unit, x.id] as const] : [])));
  return {
    t: obs.t,
    done,
    score,
    place: 1 + score.filter((s) => s > mine).length,
    energy: w.energy,
    chan: w.chan,
    chanAt: w.chanAt,
    own,
    dark,
    foe: obs.foe.map((f) => [f.id, f.p, f.cls, f.q, f.r]),
    units: w.units.map((u) => ({ id: u.id, cls: u.cls, q: u.q, r: u.r, manual: g.manual.has(u.id), goal: goalOf.get(u.id) ?? null, task: taskOf(u) })),
    goals: g.goals.map((x) => ({ id: x.id, kind: x.kind, cell: x.cell, target: x.target, unit: x.unit })),
    yardNext: g.yardNext,
    notes: [...g.notes],
    decisions: (d?.chosen ?? []).map((c) => ({ tag: c.tag, unit: c.unit, order: JSON.stringify(c.order) })),
  };
}
