import { createEngine } from '@zoria/engine';
import { RelayFollower } from '@zoria/sdk';
import type { RelayEnvelope } from '@zoria/sdk';
import type { SlotName } from '@zoria/protocol';

export interface LiveStartMsg {
  manifest: Uint8Array;
  bots: string[];
  roster: string[];
  ticks: number;
  seat: number;
}

export interface LiveTickMsg {
  t: number;
  submits: [string, Uint8Array][];
  denies: [string, number, number][];
}

export interface LiveAt {
  t: number;
  score: number | null;
}

const SLOTS: SlotName[] = ['A', 'B', 'C'];

interface Inside {
  simScoreBreakdown(p: string): { total: number };
}

export class LiveFollower {
  private follower: RelayFollower | null = null;
  slot: SlotName = 'A';
  shares: number[] | null = null;
  ticks = 1200;

  start(m: LiveStartMsg): void {
    this.follower = new RelayFollower(createEngine);
    this.slot = SLOTS[m.seat] ?? 'A';
    this.ticks = m.ticks;
    this.shares = null;
    this.follower.feed({ kind: 'start', manifest: m.manifest, bots: m.bots as SlotName[], roster: m.roster } as RelayEnvelope);
  }

  tick(m: LiveTickMsg): LiveAt {
    const f = this.follower;
    if (!f || !f.cursor) return { t: m.t, score: null };
    for (const [slot, frame] of m.submits) f.feed({ kind: 'orders', t: m.t, slot: slot as SlotName, frame } as RelayEnvelope);
    for (const [slot, i, code] of m.denies) f.feed({ kind: 'deny', t: m.t, slot: slot as SlotName, i, code } as unknown as RelayEnvelope);
    f.feed({ kind: 'tick', t: m.t } as RelayEnvelope);
    const E = f.cursor.engine as unknown as Inside;
    return { t: f.cursor.t(), score: E.simScoreBreakdown(this.slot).total };
  }

  end(shares: number[]): void {
    this.shares = [...shares];
    this.follower?.feed({ kind: 'end' } as RelayEnvelope);
  }
}
