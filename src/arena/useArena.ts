import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArenaFrame, ArenaMap, RevealFrame } from '../../bot/arena/frame.ts';
import type { GeneralCommand } from '../../bot/src/general.ts';
import type { FromWorker, ToWorker } from './protocol.ts';

export type StartOpts = Omit<Extract<ToWorker, { kind: 'start' }>, 'kind'>;

export interface Arena {
  names: string[];
  map: ArenaMap | null;
  frame: ArenaFrame | null;
  reveal: RevealFrame | null;
  running: boolean;
  speed: number;
  error: string;
  start(o: StartOpts): void;
  pause(): void;
  resume(): void;
  step(): void;
  setSpeed(x: number): void;
  command(c: GeneralCommand): void;
  askReveal(): void;
}

export function useArena(): Arena {
  const worker = useRef<Worker | null>(null);
  const game = useRef(0);
  const [names, setNames] = useState<string[]>([]);
  const [map, setMap] = useState<ArenaMap | null>(null);
  const [frame, setFrame] = useState<ArenaFrame | null>(null);
  const [reveal, setReveal] = useState<RevealFrame | null>(null);
  const [running, setRunning] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.kind === 'names') setNames(m.names);
      else if (m.kind === 'error') setError(m.message);
      else if (m.kind === 'map') {
        game.current = m.game;
        setMap(m.map);
        setFrame(null);
        setReveal(null);
      } else if (m.game !== game.current) return;
      else if (m.kind === 'frame') {
        setFrame(m.frame);
        if (m.frame.done) setRunning(false);
      } else setReveal(m.reveal);
    };
    return () => w.terminate();
  }, []);

  const send = useCallback((m: ToWorker) => worker.current?.postMessage(m), []);

  return {
    names,
    map,
    frame,
    reveal,
    running,
    speed,
    error,
    start: (o) => {
      setError('');
      setRunning(false);
      send({ kind: 'start', ...o });
    },
    pause: () => {
      setRunning(false);
      send({ kind: 'pause' });
    },
    resume: () => {
      setRunning(true);
      send({ kind: 'resume' });
    },
    step: () => send({ kind: 'step' }),
    setSpeed: (x) => {
      setSpeedState(x);
      send({ kind: 'speed', x });
    },
    command: (c) => send({ kind: 'command', c }),
    askReveal: () => send({ kind: 'reveal' }),
  };
}
