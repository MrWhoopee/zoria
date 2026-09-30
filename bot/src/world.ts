import type { ActorName, FoeEntry, SlotName, MineNeedle, MineUnit, Observe, OrderBoard, OrderProgress } from '@zoria/protocol';
import { key, keyOf, parse } from './hex.ts';
import type { Cell } from './hex.ts';
import type { Source } from './map/coverage.ts';
import { cfg } from './map/valley.ts';
import type { Valley } from './map/valley.ts';

const SLOTS: readonly SlotName[] = ['A', 'B', 'C'];

export class World {
  readonly v: Valley;
  t = 0;
  energy = 0;
  chan = 0;
  chanAt = 0;
  ear = 0;
  minutes = 0;
  stolen = 0;
  score: [number, number, number] = [0, 0, 0];
  partner: SlotName | null = null;
  offers: SlotName[] = [];
  offered: SlotName[] = [];
  breaking = false;
  offersLeft = 0;
  units: MineUnit[] = [];
  mine: MineNeedle[] = [];
  foe: FoeEntry[] = [];
  order: OrderBoard | null = null;
  hold: OrderProgress | null = null;
  owner = new Map<string, ActorName | null>();
  dark = new Map<string, boolean>();
  seen = new Map<string, number>();
  since = new Map<string, number>();
  private foeAt = new Map<string, string>();
  private foeStill = new Map<string, number>();

  constructor(v: Valley) {
    this.v = v;
    for (const c of v.ruins) this.owner.set(keyOf(c), null);
    for (const c of v.ring) this.owner.set(keyOf(c), 'K');
    for (const s of v.starts) this.owner.set(keyOf(s.cell), s.slot);
  }

  update(obs: Observe): void {
    const slot = this.v.slot;
    this.t = obs.t;
    this.energy = obs.pulse.energy;
    this.chan = obs.pulse.chan;
    this.chanAt = obs.pulse.chanAt;
    this.ear = obs.pulse.ear;
    this.minutes = obs.pulse.minutes;
    this.stolen = obs.mine.ledger.stolen;
    this.score = obs.pub.score;
    const link = obs.pub.pact.active.find((x) => x.a === this.v.slot || x.b === this.v.slot);
    this.partner = link ? (link.a === this.v.slot ? link.b : link.a) : null;
    this.offers = obs.mine.pact.in.map((o) => o.who);
    this.offered = obs.mine.pact.out.map((o) => o.who);
    this.breaking = obs.pub.pact.breaks.some((x) => x.a === this.v.slot || x.b === this.v.slot);
    this.offersLeft = obs.mine.pact.offersLeft;
    this.units = obs.mine.units;
    this.mine = obs.mine.needles;
    this.foe = obs.foe;
    const still = new Map<string, number>();
    const at = new Map<string, string>();
    for (const f of obs.foe) {
      const k = key(f.q, f.r);
      at.set(f.id, k);
      still.set(f.id, this.foeAt.get(f.id) === k ? (this.foeStill.get(f.id) ?? 0) + 1 : 0);
    }
    this.foeAt = at;
    this.foeStill = still;
    this.order = obs.pub.order;
    this.hold = obs.mine.order;
    for (const e of obs.own) {
      const k = key(e.q, e.r);
      this.owner.set(k, e.owner);
      this.dark.set(k, e.dark);
      this.seen.set(k, obs.t);
    }
    for (const e of obs.events) {
      if (e.type === 'cap') this.owner.set(key(e.q, e.r), e.p);
    }
    const held = new Set(obs.mine.needles.map((n) => key(n.q, n.r)));
    const lost = new Map(obs.mine.losts.map((l) => [key(l.q, l.r), l]));
    for (const [k, o] of this.owner) {
      if (o !== slot || held.has(k)) continue;
      const l = lost.get(k);
      this.owner.set(k, l ? l.owner : null);
      if (l) this.dark.set(k, l.dark);
    }
    const starts = new Set(this.v.starts.map((s) => keyOf(s.cell)));
    for (const k of [...this.since.keys()]) if (!held.has(k)) this.since.delete(k);
    for (const k of held) if (!this.since.has(k)) this.since.set(k, starts.has(k) ? -Infinity : obs.t);
    for (const n of obs.mine.needles) {
      const k = key(n.q, n.r);
      this.owner.set(k, slot);
      this.dark.set(k, n.dark);
      this.seen.set(k, obs.t);
    }
  }

  scoreOf(s: SlotName): number {
    return this.score[SLOTS.indexOf(s)] ?? 0;
  }

  leader(): SlotName {
    let best: SlotName = 'A';
    for (const s of SLOTS) if (this.scoreOf(s) > this.scoreOf(best)) best = s;
    return best;
  }

  stillFor(id: string): number {
    return this.foeStill.get(id) ?? 0;
  }

  stillFoe(id: string): boolean {
    return this.stillFor(id) > 0;
  }

  ownLit(): Cell[] {
    return this.mine.filter((n) => !n.dark).map((n) => ({ q: n.q, r: n.r }));
  }

  foeLit(): Source[] {
    const out: Source[] = [];
    const ringPull = cfg(this.v, 'ringPull');
    for (const [k, o] of this.owner) {
      if (o === null || o === this.v.slot || this.dark.get(k) === true) continue;
      out.push({ cell: parse(k), mult: this.v.ringKeys.has(k) ? ringPull : 1 });
    }
    return out;
  }
}
