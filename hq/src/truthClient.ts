import TruthWorker from './engine.worker.ts?worker&inline';
import type { FromTruth, ToTruth } from './model/queue.ts';
import type { TruthAt } from './model/truth.ts';

export interface TruthAnswer {
  key: string;
  at: TruthAt;
}

export class TruthClient {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly wanted = new Map<number, string>();
  private readonly ids = new Map<string, number>();
  onAnswer: (a: TruthAnswer) => void = () => undefined;

  constructor() {
    this.worker = new TruthWorker();
    this.worker.onmessage = (e: MessageEvent<FromTruth>) => {
      const m = e.data;
      if (m.kind !== 'truth') return;
      const key = this.wanted.get(m.id);
      this.wanted.delete(m.id);
      if (key) this.onAnswer({ key, at: m.at });
    };
  }

  open(slot: number, bytes: Uint8Array): void {
    const copy = bytes.slice().buffer;
    const msg: ToTruth = { kind: 'open', match: slot, bytes: copy };
    this.worker.postMessage(msg, [copy]);
  }

  ask(slot: number, t: number, key: string): void {
    const id = this.nextId++;
    this.wanted.set(id, key);
    this.ids.set(key, id);
    const msg: ToTruth = { kind: 'at', match: slot, t, id };
    this.worker.postMessage(msg);
  }
}
