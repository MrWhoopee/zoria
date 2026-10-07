import { Truth } from './truth.ts';
import type { TruthAt } from './truth.ts';

export type ToTruth = { kind: 'open'; match: number; bytes: ArrayBuffer } | { kind: 'at'; match: number; t: number; id: number };

export type FromTruth = { kind: 'opened'; match: number; ticks: number } | { kind: 'truth'; match: number; id: number; at: TruthAt } | { kind: 'missing'; match: number; id: number } | { kind: 'failed'; match: number; why: string };

export class TruthQueue {
  private readonly matches = new Map<number, Truth>();
  private readonly waiting = new Map<number, { t: number; id: number }>();
  private scheduled = false;
  private readonly send: (m: FromTruth) => void;
  private readonly later: (fn: () => void) => void;

  constructor(send: (m: FromTruth) => void, later: (fn: () => void) => void) {
    this.send = send;
    this.later = later;
  }

  handle(m: ToTruth): void {
    if (m.kind === 'open') {
      try {
        const truth = new Truth(new Uint8Array(m.bytes));
        this.matches.set(m.match, truth);
        this.send({ kind: 'opened', match: m.match, ticks: truth.ticks });
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
