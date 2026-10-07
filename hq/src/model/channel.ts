import { DENY_CODES, decodeOrders, readRunLog } from '@zoria/protocol';

export interface ChannelAt {
  bytes: number;
  orders: number;
  denied: number;
}

export class Channel {
  private readonly frames = new Map<number, ChannelAt>();
  private readonly words = new Map<string, string>();
  private readonly perTick = new Map<number, number>();
  private readonly worst: number;
  readonly series: { t: number; bytes: number; denied: number }[] = [];

  constructor(bytes: Uint8Array, slot: string) {
    const log = readRunLog(bytes);
    for (const [t, s, frame] of log.submits) {
      if (s !== slot) continue;
      this.frames.set(t, { bytes: frame.length, orders: decodeOrders(frame)?.length ?? 0, denied: 0 });
    }
    for (const [s, t, i, code] of log.denies ?? []) {
      if (s !== slot) continue;
      this.words.set(t + ':' + i, DENY_CODES[code] ?? String(code));
      this.perTick.set(t, (this.perTick.get(t) ?? 0) + 1);
      const f = this.frames.get(t) ?? { bytes: 0, orders: 0, denied: 0 };
      this.frames.set(t, { ...f, denied: f.denied + 1 });
    }
    let worst = 0;
    let most = 0;
    for (const [t, n] of [...this.perTick].sort((a, b) => a[0] - b[0])) {
      if (n > most) {
        most = n;
        worst = t;
      }
    }
    this.worst = worst;
    for (const [t, f] of [...this.frames].sort((a, b) => a[0] - b[0])) this.series.push({ t, bytes: f.bytes, denied: f.denied });
  }

  at(t: number): ChannelAt {
    return this.frames.get(t) ?? { bytes: 0, orders: 0, denied: 0 };
  }

  denyWord(t: number, i: number): string {
    return this.words.get(t + ':' + i) ?? '-';
  }

  worstTick(): number {
    return this.worst;
  }
}
