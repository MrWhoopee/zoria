import type { ClsName, MineUnit, Order } from '@zoria/protocol';
import { dist, keyOf } from './hex.ts';
import type { Cell } from './hex.ts';
import { bytesFor } from './plans/types.ts';
import type { Ctx, Memo, Task } from './plans/types.ts';

export type GoalKind = 'jam' | 'ram' | 'build';

export interface Goal {
  id: number;
  kind: GoalKind;
  cell: Cell | null;
  target: string | null;
  unit: string | null;
  since: number;
  seen: number;
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
    g.goals.push({ id: g.nextId++, kind: c.goal, cell, target, unit: null, since: t, seen: t });
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

export const GOAL_SIGHT_TICKS = 20;

const none = (): void => undefined;

function free(u: MineUnit): boolean {
  const t = u.task;
  return t === null || (t.site === null && t.jam === null && t.ram === null && t.feed === null && t.path === 0);
}

function goalTask(ctx: Ctx, u: MineUnit, tag: string, order: Order, to: Cell, id: number): Task {
  const refused = (m: Memo, code: number): void => {
    m.general.goals = m.general.goals.filter((x) => x.id !== id);
    note(m.general, 't' + ctx.w.t + ': наказ ' + id + ' (' + order.kind + ') відмова ' + code + ', знято');
  };
  return { tag, unit: u.id, order, value: GENERAL_VALUE - dist(u, to), bytes: bytesFor(ctx, order.kind, u), energy: 0, commit: none, refused };
}

function goalTasks(ctx: Ctx): Task[] {
  const { w, v } = ctx;
  const g = ctx.memo.general;
  const alive = new Map(w.units.map((u) => [u.id, u]));
  const taken = new Set([...g.manual]);
  for (const x of g.goals) if (x.unit && g.manual.has(x.unit)) x.unit = null;
  for (const x of g.goals) if (x.unit && alive.has(x.unit)) taken.add(x.unit);
  const out: Task[] = [];
  const keep: Goal[] = [];
  for (const x of g.goals) {
    const foe = x.target ? w.foe.find((f) => f.id === x.target) : undefined;
    if (foe) x.seen = w.t;
    const to: Cell | null = x.cell ?? (foe ? { q: foe.q, r: foe.r } : null);
    const where = keyOf(x.cell ?? v.base);
    const owner = x.cell ? w.owner.get(keyOf(x.cell)) ?? null : null;
    const foeOwned = owner !== null && owner !== v.slot && owner !== 'K';
    if (x.kind === 'jam' && x.cell && v.starts.some((s) => s.cell.q === x.cell?.q && s.cell.r === x.cell.r)) {
      note(g, 't' + w.t + ': голка ' + where + ' під щитом, глушити не можна');
      continue;
    }
    if (x.kind === 'jam' && !foeOwned) {
      note(g, 't' + w.t + ': глушити ' + where + ' - готово або неможливо');
      continue;
    }
    if (x.kind === 'build' && owner === v.slot) {
      note(g, 't' + w.t + ': голка ' + where + ' стоїть');
      continue;
    }
    if (x.kind === 'build' && owner !== null) {
      note(g, 't' + w.t + ': соту ' + where + ' зайнято');
      continue;
    }
    if (x.kind === 'ram' && !foe && w.t - x.seen > GOAL_SIGHT_TICKS) {
      note(g, 't' + w.t + ': ' + (x.target ?? '?') + ' зник з поля зору');
      continue;
    }
    keep.push(x);
    if (!to) continue;
    let u = x.unit ? alive.get(x.unit) : undefined;
    if (!u) {
      const cls = x.kind === 'build' ? 'ткач' : 'клинок';
      u = w.units.filter((m) => m.cls === cls && !taken.has(m.id)).sort((a, b) => dist(a, to) - dist(b, to) || a.id.localeCompare(b.id))[0];
      x.unit = u ? u.id : null;
      if (u) taken.add(u.id);
    }
    if (!u) continue;
    if (x.kind === 'jam' && x.cell) {
      const holding = u.task?.jam?.q === x.cell.q && u.task.jam.r === x.cell.r;
      if (dist(u, x.cell) <= 1 && !holding) out.push(goalTask(ctx, u, 'general:jam', { kind: 'jam', unit: u.id, target: x.cell, hold: true }, x.cell, x.id));
      else if (dist(u, x.cell) > 1 && free(u)) out.push(goalTask(ctx, u, 'general:jam', { kind: 'move', unit: u.id, q: x.cell.q, r: x.cell.r, goal: null, home: false }, x.cell, x.id));
    } else if (x.kind === 'ram' && foe && x.target && u.task?.ram !== x.target) out.push(goalTask(ctx, u, 'general:ram', { kind: 'ram', unit: u.id, target: x.target }, to, x.id));
    else if (x.kind === 'build' && x.cell && free(u)) out.push(goalTask(ctx, u, 'general:build', { kind: 'needle', unit: u.id, q: x.cell.q, r: x.cell.r }, x.cell, x.id));
  }
  g.goals = keep;
  return out;
}

export function general(ctx: Ctx): Task[] {
  return [...manualTasks(ctx), ...goalTasks(ctx)];
}
