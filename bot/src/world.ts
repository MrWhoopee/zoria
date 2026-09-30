import type { ActorName, FoeEntry, MineNeedle, MineUnit, Observe, OrderBoard, OrderProgress } from '@zoria/protocol';
import { key, keyOf, parse } from './hex.ts';
import type { Cell } from './hex.ts';
import type { Source } from './map/coverage.ts';
import { cfg } from './map/valley.ts';
import type { Valley } from './map/valley.ts';

export class World {
  readonly v: Valley;
  t = 0;
  energy = 0;
  chan = 0;
  chanAt = 0;
  ear = 0;
  minutes = 0;
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
  private foeWas = new Map<string, string>();

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
    this.units = obs.mine.units;
    this.mine = obs.mine.needles;
    this.foe = obs.foe;
    this.foeWas = this.foeAt;
    this.foeAt = new Map(obs.foe.map((f) => [f.id, key(f.q, f.r)]));
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

  stillFoe(id: string): boolean {
    const now = this.foeAt.get(id);
    return now !== undefined && now === this.foeWas.get(id);
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
