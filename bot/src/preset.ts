export interface Preset {
  name: string;
  tkachTarget: number;
  buildReserve: number;
  etaPower: number;
  feed: boolean;
  harm: number;
  unlock: number;
  steal: number;
  repair: number;
  klinokTarget: number;
  contract: number;
  dawnPrep: number;
  ramGrace: number;
  ramStill: number;
  ramTiming: number;
  chaseOff: number;
  ramJammers: number;
  guardFirst: number;
  jam: number;
  jamHome: number;
  jamLeader: number;
}

const BASE: Preset = { name: 'основний', tkachTarget: 3, buildReserve: 0, etaPower: 1, feed: false, harm: 0.5, unlock: 0.5, steal: 1, repair: 1, klinokTarget: 2, contract: 1, dawnPrep: 1, ramGrace: 0, ramStill: 0, ramTiming: 0, chaseOff: 0, ramJammers: 0, guardFirst: 1, jam: 0, jamHome: 1, jamLeader: 1 };

export const PRESETS: Record<string, Preset> = {
  основний: BASE,
  широкий: { ...BASE, name: 'широкий', tkachTarget: 4, etaPower: 0.8 },
  ближній: { ...BASE, name: 'ближній', etaPower: 1.5 },
  скупий: { ...BASE, name: 'скупий', tkachTarget: 2, buildReserve: 60 },
  варта: { ...BASE, name: 'варта', tkachTarget: 2, klinokTarget: 4 },
};

type Knob = Exclude<keyof Preset, 'name'>;

const KNOBS: readonly Knob[] = ['tkachTarget', 'buildReserve', 'etaPower', 'feed', 'harm', 'unlock', 'steal', 'repair', 'klinokTarget', 'contract', 'dawnPrep', 'ramGrace', 'ramStill', 'ramTiming', 'chaseOff', 'ramJammers', 'guardFirst', 'jam', 'jamHome', 'jamLeader'];

function isKnob(k: string): k is Knob {
  return (KNOBS as readonly string[]).includes(k);
}

export function presetOf(name: string): Preset {
  const [head, ...knobs] = name.split('+');
  const base = PRESETS[head ?? ''] ?? BASE;
  if (knobs.length === 0) return base;
  const out: Preset = { ...base, name };
  for (const k of knobs) {
    const [key, value] = k.split('=');
    const num = Number(value);
    if (!key || !isKnob(key) || value === undefined || value === '' || Number.isNaN(num)) throw new Error('bad preset knob ' + k);
    if (key === 'feed') out.feed = num !== 0;
    else out[key] = num;
  }
  return out;
}
