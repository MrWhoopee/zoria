import { Truth } from './truth.ts';
import type { TruthAt } from './truth.ts';
import { LiveFollower } from './live.ts';
import type { LiveStartMsg, LiveTickMsg } from './live.ts';

export type ToTruth = { kind: 'open'; match: number; bytes: ArrayBuffer } | { kind: 'at'; match: number; t: number; id: number } | ({ kind: 'live-start' } & LiveStartMsg) | ({ kind: 'live-tick' } & LiveTickMsg) | { kind: 'live-end'; shares: number[] };

export type FromTruth = { kind: 'opened'; match: number; ticks: number; land: [string, string][] } | { kind: 'truth'; match: number; id: number; at: TruthAt } | { kind: 'missing'; match: number; id: number } | { kind: 'failed'; match: number; why: string } | { kind: 'live'; t: number; score: number | null; scene: TruthAt | null };

export class TruthQueue {
  private readonly matches = new Map<number, Truth>();
  private readonly waiting = new Map<number, { t: number; id: number }>();
  private scheduled = false;
  private readonly live = new LiveFollower();
  private readonly send: (m: FromTruth) => void;
  private readonly later: (fn: () => void) => void;

  constructor(send: (m: FromTruth) => void, later: (fn: () => void) => void) {
    this.send = send;
    this.later = later;
  }

  handle(m: ToTruth): void {
    if (m.kind === 'live-start') {
      this.live.start(m);
      return;
    }
    if (m.kind === 'live-tick') {
      const at = this.live.tick(m);
      this.send({ kind: 'live', t: at.t, score: at.score, scene: at.scene });
      return;
    }
    if (m.kind === 'live-end') {
      this.live.end(m.shares);
      return;
    }
    if (m.kind === 'open') {
      try {
        const truth = new Truth(new Uint8Array(m.bytes));
        this.matches.set(m.match, truth);
        this.send({ kind: 'opened', match: m.match, ticks: truth.ticks, land: truth.land() });
      } catch (e) {
        this.send({ kind: 'failed', match: m.match, why: e instanceof Error ? e.message : String(e) });
      }
      return;
    }
    this.waiting.set(m.match, { t: m.t, id: m.id });
    this.arm();
  }

  private arm(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    this.later(() => {
      this.scheduled = false;
      for (const [match, w] of [...this.waiting]) {
        this.waiting.delete(match);
        const truth = this.matches.get(match);
        if (!truth) this.send({ kind: 'missing', match, id: w.id });
        else this.send({ kind: 'truth', match, id: w.id, at: truth.at(w.t) });
      }
    });
  }
}
