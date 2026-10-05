import { createEngine } from '@zoria/engine';
import { openMatch } from '@zoria/sdk';
import type { OpenedMatch, WireBot } from '@zoria/sdk';
import { decodeManifest } from '@zoria/protocol';
import type { SlotName } from '@zoria/protocol';
import { applyCommand } from '../src/general.ts';
import type { GeneralCommand } from '../src/general.ts';
import { keyOf } from '../src/hex.ts';
import { buildValley } from '../src/map/valley.ts';
import { createStrategy } from '../src/strategy.ts';
import type { Strategy } from '../src/strategy.ts';
import { frameOf } from './frame.ts';
import type { ArenaFrame, ArenaMap, RevealFrame } from './frame.ts';
import type { ArenaRecord } from './record.ts';
import { rivalSeat } from './roster.ts';

const SLOTS: SlotName[] = ['A', 'B', 'C'];

interface Inside {
  SIM: { units: { id: string; p: string; cls: string; q: number; r: number; from: number; until: number }[]; world: { own: Record<string, string | null> } };
}

export interface SessionOpts {
  seed: number;
  slot: SlotName;
  rivals: [string, string];
  preset: string;
}

export class Session {
  readonly map: ArenaMap;
  private readonly m: OpenedMatch;
  private readonly me: Strategy;
  private readonly slot: SlotName;
  private pending: GeneralCommand[] = [];
  private readonly rec: ArenaRecord;
  private last: ArenaFrame | null = null;

  constructor(o: SessionOpts, at: string = new Date().toISOString()) {
    this.slot = o.slot;
    this.rec = { v: 1, at, seed: o.seed, slot: o.slot, rivals: [o.rivals[0], o.rivals[1]], preset: o.preset, commands: [], end: null };
    this.me = createStrategy(o.preset);
    const bots: Partial<Record<SlotName, WireBot>> = { [o.slot]: this.me };
    const styles: Partial<Record<SlotName, Record<string, unknown>>> = {};
    SLOTS.filter((s) => s !== o.slot).forEach((s, i) => {
      const seat = rivalSeat(o.rivals[i] ?? '');
      if (seat.bot) bots[s] = seat.bot;
      if (seat.style) styles[s] = seat.style;
    });
    this.m = openMatch(createEngine, { seed: o.seed, ticks: 1200, bots, styles });
    const man = decodeManifest(this.m.manifest);
    if (!man) throw new Error('manifest did not decode');
    const v = buildValley(man, o.slot);
    this.map = {
      slot: o.slot,
      cells: v.cells.map((c) => [c.q, c.r, v.types[v.terrain.get(keyOf(c)) ?? 0]?.name ?? 'bare', v.level.get(keyOf(c)) ?? 0]),
      seats: { A: v.seats.A, B: v.seats.B, C: v.seats.C },
      ring: v.ring,
      starts: v.starts.map((s) => s.cell),
      dawnAt: v.dawnAt,
    };
  }

  command(c: GeneralCommand): void {
    this.pending.push(c);
  }

  done(): boolean {
    return this.m.done();
  }

  step(): ArenaFrame | null {
    if (this.m.done()) return null;
    const g = this.me.general();
    if (g) {
      for (const c of this.pending.splice(0)) {
        applyCommand(g, c, this.m.t());
        this.rec.commands.push({ t: this.m.t(), c });
      }
    }
    this.m.step();
    const obs = this.me.lastObserve();
    const w = this.me.world();
    const after = this.me.general();
    if (!obs || !w || !after) return null;
    this.last = frameOf(this.slot, w, obs, after, this.me.decisions(), this.m.done());
    return this.last;
  }

  record(): ArenaRecord {
    const f = this.last;
    return { ...this.rec, commands: [...this.rec.commands], end: f ? { t: f.t, done: f.done, score: f.score, place: f.place } : null };
  }

  reveal(): RevealFrame | null {
    if (!this.m.done()) return null;
    const E = this.m.engine as unknown as Inside;
    const t = this.m.t();
    return { own: { ...E.SIM.world.own }, units: E.SIM.units.filter((u) => u.from <= t && u.until >= t).map((u) => [u.id, u.p, u.cls, u.q, u.r]) };
  }
}
