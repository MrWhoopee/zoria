import type { ClsName, Order } from '@zoria/protocol';
import type { Cell } from './hex.ts';
import { bytesFor } from './plans/types.ts';
import type { Ctx, Task } from './plans/types.ts';

export type GoalKind = 'jam' | 'ram' | 'build';

export interface Goal {
  id: number;
  kind: GoalKind;
  cell: Cell | null;
  target: string | null;
  unit: string | null;
  since: number;
}

export interface General {
  manual: Set<string>;
  queue: Map<string, Order>;
  goals: Goal[];
  yardNext: ClsName | null;
  notes: string[];
  nextId: number;
}

export type GeneralCommand =
  | { kind: 'take'; unit: string }
  | { kind: 'release'; unit: string }
  | { kind: 'order'; order: Order }
  | { kind: 'goal'; goal: GoalKind; cell?: Cell; target?: string }
  | { kind: 'cancel'; id: number }
  | { kind: 'yard'; cls: ClsName | null };

const NOTES = 20;

export function newGeneral(): General {
  return { manual: new Set(), queue: new Map(), goals: [], yardNext: null, notes: [], nextId: 1 };
}

export function note(g: General, text: string): void {
  g.notes.push(text);
  if (g.notes.length > NOTES) g.notes.splice(0, g.notes.length - NOTES);
}

function unitOf(o: Order): string | null {
  return 'unit' in o ? o.unit : null;
}

export function applyCommand(g: General, c: GeneralCommand, t: number): void {
  if (c.kind === 'take') g.manual.add(c.unit);
  else if (c.kind === 'release') {
    g.manual.delete(c.unit);
    g.queue.delete(c.unit);
  } else if (c.kind === 'order') {
    const u = unitOf(c.order);
    if (u === null) {
      note(g, 't' + t + ': команда ' + c.order.kind + ' без машини');
      return;
    }
    g.manual.add(u);
    g.queue.set(u, c.order);
  } else if (c.kind === 'goal') {
    const cell = c.goal === 'ram' ? null : c.cell ?? null;
    const target = c.goal === 'ram' ? c.target ?? null : null;
    if ((c.goal === 'ram' && target === null) || (c.goal !== 'ram' && cell === null)) {
      note(g, 't' + t + ': наказ ' + c.goal + ' без цілі');
      return;
    }
    g.goals.push({ id: g.nextId++, kind: c.goal, cell, target, unit: null, since: t });
  } else if (c.kind === 'cancel') g.goals = g.goals.filter((x) => x.id !== c.id);
  else g.yardNext = c.cls;
}

export function reserved(g: General): Set<string> {
  const out = new Set(g.manual);
  for (const x of g.goals) if (x.unit) out.add(x.unit);
  return out;
}

export const GENERAL_VALUE = 1e7;

function manualTasks(ctx: Ctx): Task[] {
  const g = ctx.memo.general;
  const alive = new Map(ctx.w.units.map((u) => [u.id, u]));
  const out: Task[] = [];
  for (const id of [...g.manual]) {
    if (!alive.has(id)) {
      g.manual.delete(id);
      g.queue.delete(id);
      note(g, 't' + ctx.w.t + ': ' + id + ' більше немає');
    }
  }
  for (const [id, order] of g.queue) {
    const u = alive.get(id);
    if (!u) continue;
    out.push({
      tag: 'general:order',
      unit: id,
      order,
      value: GENERAL_VALUE,
      bytes: bytesFor(ctx, order.kind, u),
      energy: 0,
      commit: (m) => {
        if (m.general.queue.get(id) === order) m.general.queue.delete(id);
      },
      refused: (m, code) => {
        m.general.queue.delete(id);
        note(m.general, 't' + ctx.w.t + ': ' + id + ' ' + order.kind + ' відмова ' + code);
      },
    });
  }
  return out;
}

export function general(ctx: Ctx): Task[] {
  return manualTasks(ctx);
}
