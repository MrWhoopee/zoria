import type { MineUnit, Observe } from '@zoria/protocol';

export function makeObs(over: Partial<Observe> = {}): Observe {
  return {
    t: 1,
    pulse: { energy: 120, chan: 141, chanAt: 141, ear: 1000, earAt: 1386, minutes: 0, needles: 2, mercy: false },
    mine: {
      needles: [],
      units: [],
      jams: [],
      losts: [],
      order: null,
      pact: { in: [], out: [], offersLeft: 2, cryAt: null },
      ledger: { pactTax: 0, stolen: 0 },
    },
    own: [],
    foe: [],
    noisy: [],
    pub: { order: null, pact: { active: [], breaks: [] }, cries: [], dawn: false, score: [0, 0, 0] },
    events: [],
    ...over,
  };
}

export function tkach(id: string, q: number, r: number, over: Partial<MineUnit> = {}): MineUnit {
  return { id, cls: 'ткач', q, r, mute: false, stuck: false, wait: 0, work: 0, away: 0, task: null, ...over };
}
