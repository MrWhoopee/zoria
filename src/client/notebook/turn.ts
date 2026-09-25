import { constrain, origin, target, type PageFrame, type Point, type Side } from './curl.ts';

export type Turn =
  | { phase: 'idle' }
  | { phase: 'peek'; side: Side; pointer: Point }
  | { phase: 'drag'; side: Side; pointer: Point }
  | { phase: 'settle'; side: Side; from: Point; to: Point; startedAt: number; ms: number; complete: boolean; arc: number };

export type TurnFrame = { side: Side | null; pointer: Point; done: boolean; completed: boolean };

export const IDLE: Turn = { phase: 'idle' };

const PEEK = 0.07;
const AUTO_MS = 650;
const AUTO_ARC = 0.22;
const SETTLE_MIN_MS = 160;
const SETTLE_SPAN_MS = 380;

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

const ease = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

export function peek(side: Side, f: PageFrame): Turn {
  const o = origin(side, f);
  const dx = side === 'next' ? -PEEK * f.w : PEEK * f.w;
  return { phase: 'peek', side, pointer: { x: o.x + dx, y: o.y + PEEK * f.w } };
}

export function grab(side: Side, f: PageFrame, pointer: Point): Turn {
  return { phase: 'drag', side, pointer: constrain(side, f, pointer) };
}

export function drag(t: Turn, f: PageFrame, pointer: Point): Turn {
  return t.phase === 'drag' ? { ...t, pointer: constrain(t.side, f, pointer) } : t;
}

export function release(t: Turn, f: PageFrame, now: number): Turn {
  if (t.phase !== 'drag') return IDLE;
  const start = origin(t.side, f);
  const end = target(t.side, f);
  const complete = distance(t.pointer, end) < distance(t.pointer, start);
  const to = complete ? end : start;
  const ms = SETTLE_MIN_MS + (SETTLE_SPAN_MS * distance(t.pointer, to)) / (2 * f.w);
  return { phase: 'settle', side: t.side, from: t.pointer, to, startedAt: now, ms, complete, arc: 0 };
}

export function autoTurn(side: Side, f: PageFrame, now: number): Turn {
  return {
    phase: 'settle', side, from: origin(side, f), to: target(side, f),
    startedAt: now, ms: AUTO_MS, complete: true, arc: AUTO_ARC * f.h,
  };
}

export function frameAt(t: Turn, now: number): TurnFrame {
  if (t.phase === 'idle') return { side: null, pointer: { x: 0, y: 0 }, done: true, completed: false };
  if (t.phase !== 'settle') return { side: t.side, pointer: t.pointer, done: false, completed: false };
  const k = Math.min(1, Math.max(0, (now - t.startedAt) / t.ms));
  if (k >= 1) return { side: t.side, pointer: t.to, done: true, completed: t.complete };
  const e = ease(k);
  return {
    side: t.side,
    pointer: {
      x: t.from.x + (t.to.x - t.from.x) * e,
      y: t.from.y + (t.to.y - t.from.y) * e + t.arc * Math.sin(Math.PI * e),
    },
    done: false,
    completed: false,
  };
}
