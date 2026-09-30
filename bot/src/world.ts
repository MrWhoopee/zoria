import type { ActorName, FoeEntry, MineNeedle, MineUnit, Observe } from '@zoria/protocol';
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
  owner = new Map<string, ActorName | null>();
  dark = new Map<string, boolean>();
  seen = new Map<string, number>();

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
    for (const n of obs.mine.needles) {
      const k = key(n.q, n.r);
      this.owner.set(k, slot);
      this.dark.set(k, n.dark);
      this.seen.set(k, obs.t);
    }
  }

  ownLit(): Cell[] {
    return this.mine.filter((n) => !n.dark).map((n) => ({ q: n.q, r: n.r }));
  }

  foeLit(): Source[] {
    const out: Source[] = [];
    const ringPull = cfg(this.v, 'ringPull');
    for (const [k, o] of this.owner) {
      if (o === null || o === this.v.slot || this.dark.get(k) === true) continue;
      const ring = o === 'K' && this.v.ringKeys.has(k);
      out.push({ cell: parse(k), mult: ring ? ringPull : 1 });
    }
    return out;
  }
}
