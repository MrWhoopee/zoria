import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageFrame, Point, Side } from '../notebook/curl.ts';
import { autoTurn, drag, frameAt, grab, IDLE, peek, release, type Turn, type TurnFrame } from '../notebook/turn.ts';

export type TurnControl = {
  frame: TurnFrame;
  size: PageFrame;
  busy: boolean;
  dragging: boolean;
  peek(side: Side, size: PageFrame): void;
  unpeek(): void;
  grab(side: Side, size: PageFrame, p: Point): void;
  move(p: Point): void;
  drop(): void;
  auto(side: Side, size: PageFrame): void;
};

export function useTurn(onDone: (side: Side, completed: boolean) => void): TurnControl {
  const [turn, setTurn] = useState<Turn>(IDLE);
  const [size, setSize] = useState<PageFrame>({ w: 1, h: 1 });
  const [now, setNow] = useState(0);
  const doneRef = useRef(onDone);

  useEffect(() => { doneRef.current = onDone; });

  useEffect(() => {
    if (turn.phase !== 'settle') return;
    let raf = 0;
    const step = (): void => {
      const t = performance.now();
      const f = frameAt(turn, t);
      if (f.done) {
        setTurn(IDLE);
        doneRef.current(turn.side, f.completed);
        return;
      }
      setNow(t);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [turn]);

  const busy = turn.phase === 'drag' || turn.phase === 'settle';

  return {
    frame: frameAt(turn, turn.phase === 'settle' ? Math.max(now, turn.startedAt) : now),
    size,
    busy,
    dragging: turn.phase === 'drag',
    peek: useCallback((side: Side, s: PageFrame) => {
      setSize(s);
      setTurn((t) => (t.phase === 'idle' ? peek(side, s) : t));
    }, []),
    unpeek: useCallback(() => setTurn((t) => (t.phase === 'peek' ? IDLE : t)), []),
    grab: useCallback((side: Side, s: PageFrame, p: Point) => {
      setSize(s);
      setTurn((t) => (t.phase === 'idle' || t.phase === 'peek' ? grab(side, s, p) : t));
    }, []),
    move: useCallback((p: Point) => setTurn((t) => drag(t, size, p)), [size]),
    drop: useCallback(() => setTurn((t) => (t.phase === 'drag' ? release(t, size, performance.now()) : t)), [size]),
    auto: useCallback((side: Side, s: PageFrame) => {
      setSize(s);
      setTurn((t) => (t.phase === 'idle' || t.phase === 'peek' ? autoTurn(side, s, performance.now()) : t));
    }, []),
  };
}
