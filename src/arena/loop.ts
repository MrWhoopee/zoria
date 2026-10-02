import type { ArenaFrame, ArenaMap, RevealFrame } from '../../bot/arena/frame.ts';
import type { GeneralCommand } from '../../bot/src/general.ts';
import type { FromWorker, ToWorker } from './protocol.ts';

export const TICK_MS = 500;
export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

export type StartOpts = Extract<ToWorker, { kind: 'start' }>;

export interface SessionLike {
  map: ArenaMap;
  step(): ArenaFrame | null;
  command(c: GeneralCommand): void;
  done(): boolean;
  reveal(): RevealFrame | null;
}

export class Loop {
  private game = 0;
  private s: SessionLike | null = null;
  private speed = 1;
  private timer: unknown = null;
  private running = false;
  private readonly post: (m: FromWorker) => void;
  private readonly schedule: (fn: () => void, ms: number) => unknown;
  private readonly cancel: (h: unknown) => void;
  private readonly make: (o: StartOpts) => SessionLike;

  constructor(post: (m: FromWorker) => void, schedule: (fn: () => void, ms: number) => unknown, cancel: (h: unknown) => void, make: (o: StartOpts) => SessionLike) {
    this.post = post;
    this.schedule = schedule;
    this.cancel = cancel;
    this.make = make;
  }

  handle(m: ToWorker): void {
    if (m.kind === 'start') {
      this.stop();
      this.game++;
      this.s = this.make(m);
      this.post({ kind: 'map', game: this.game, map: this.s.map });
    } else if (m.kind === 'resume') {
      this.running = true;
      this.clear();
      this.arm();
    } else if (m.kind === 'pause') this.stop();
    else if (m.kind === 'step') {
      if (!this.running) this.tick(this.game);
    } else if (m.kind === 'speed') {
      if (SPEEDS.includes(m.x)) this.speed = m.x;
      if (this.running) {
        this.clear();
        this.arm();
      }
    } else if (m.kind === 'command') this.s?.command(m.c);
    else {
      const r = this.s?.reveal();
      if (r) this.post({ kind: 'reveal', game: this.game, reveal: r });
    }
  }

  private arm(): void {
    if (!this.s || this.s.done()) {
      this.running = false;
      return;
    }
    const game = this.game;
    this.timer = this.schedule(() => {
      this.timer = null;
      if (game !== this.game || !this.running) return;
      this.tick(game);
      this.arm();
    }, TICK_MS / this.speed);
  }

  private tick(game: number): void {
    if (!this.s || game !== this.game) return;
    const f = this.s.step();
    if (f) this.post({ kind: 'frame', game, frame: f });
  }

  private clear(): void {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
  }

  private stop(): void {
    this.running = false;
    this.clear();
  }
}
