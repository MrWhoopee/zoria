import { createEngine } from '@zoria/engine';
import { decodeManifest, readRunLog } from '@zoria/protocol';
import { openJournal } from '@zoria/sdk';
import type { JournalCursor } from '@zoria/sdk';
import { nickOfSlot } from './names.ts';

export interface TruthAt {
  t: number;
  owners: Record<string, string | null>;
  score: Record<string, number>;
  needles: Record<string, number>;
}

interface Inside {
  SIM: { world: { own: Record<string, string | null>; needles: Record<string, number> } };
  simScoreBreakdown(p: string): { total: number };
}

const SLOTS = ['A', 'B', 'C'];

export class Truth {
  private readonly cursor: JournalCursor;

  constructor(bytes: Uint8Array) {
    this.cursor = openJournal(createEngine, bytes);
  }

  get ticks(): number {
    return this.cursor.ticks;
  }

  at(t: number): TruthAt {
    const tick = Math.max(0, Math.min(this.cursor.ticks, Math.round(t)));
    this.cursor.seek(tick);
    const E = this.cursor.engine as unknown as Inside;
    const score: Record<string, number> = {};
    const needles: Record<string, number> = {};
    for (const s of SLOTS) {
      score[s] = E.simScoreBreakdown(s).total;
      needles[s] = E.SIM.world.needles[s] ?? 0;
    }
    return { t: this.cursor.t(), owners: { ...E.SIM.world.own }, score, needles };
  }
}

export function ownerTruth(owners: Record<string, string | null>, cell: string, roster: readonly string[]): string {
  const o = owners[cell];
  return o === null || o === undefined ? '-' : nickOfSlot(roster, o);
}

export function diffCount(owners: Record<string, string | null>, belief: Map<string, string | null>, needles: readonly string[]): number {
  let n = 0;
  for (const k of needles) {
    if (!belief.has(k)) continue;
    if ((belief.get(k) ?? null) !== (owners[k] ?? null)) n++;
  }
  return n;
}

export function manifestNeedles(bytes: Uint8Array): string[] {
  const m = decodeManifest(readRunLog(bytes).manifest);
  if (!m) return [];
  return [...new Set(m.needles.map((n) => n.q + ',' + n.r))];
}
