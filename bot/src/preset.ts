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
  pact: number;
  pactGap: number;
}

const BASE: Preset = { name: 'основний', tkachTarget: 3, buildReserve: 0, etaPower: 1, feed: false, harm: 0.5, unlock: 0.5, steal: 1, repair: 1, klinokTarget: 2, contract: 1, dawnPrep: 1, ramGrace: 0, ramStill: 0, ramTiming: 0, chaseOff: 0, ramJammers: 0, guardFirst: 1, jam: 0, jamHome: 1, jamLeader: 1, pact: 0, pactGap: 0.15 };

export const PRESETS: Record<string, Preset> = {
  основний: BASE,
  широкий: { ...BASE, name: 'широкий', tkachTarget: 4, etaPower: 0.8 },
  ближній: { ...BASE, name: 'ближній', etaPower: 1.5 },
  скупий: { ...BASE, name: 'скупий', tkachTarget: 2, buildReserve: 60 },
  варта: { ...BASE, name: 'варта', tkachTarget: 2, klinokTarget: 4 },
  глушій: { ...BASE, name: 'глушій', tkachTarget: 2, klinokTarget: 4, jam: 1, jamHome: 0, jamLeader: 3 },
};

type Knob = Exclude<keyof Preset, 'name'>;

const KNOBS: readonly Knob[] = ['tkachTarget', 'buildReserve', 'etaPower', 'feed', 'harm', 'unlock', 'steal', 'repair', 'klinokTarget', 'contract', 'dawnPrep', 'ramGrace', 'ramStill', 'ramTiming', 'chaseOff', 'ramJammers', 'guardFirst', 'jam', 'jamHome', 'jamLeader', 'pact', 'pactGap'];

function isKnob(k: string): k is Knob {
  return (KNOBS as readonly string[]).includes(k);
}

function single(name: string): Preset {
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

export interface Step {
  at: number;
  preset: Preset;
}

export type Schedule = Step[];

export const SCHEDULES: Record<string, string> = {
  загарбник: 'широкий+tkachTarget=5>глушій+klinokTarget=6@400',
  'пізній-глушій': 'скупий>глушій@600',
  'ранній-глушій': 'глушій+jamLeader=6>широкий@500',
  рейдер: 'варта>глушій+jamLeader=6@800',
  маятник: 'основний>глушій@300>широкий@700',
};

const baseOf = (segment: string): string => segment.split('+')[0] ?? '';

export function scheduleOf(name: string): Schedule {
  const text = SCHEDULES[name] ?? name;
  const parts = text.split('>');
  if (parts.length === 1 && !text.includes('@')) return [{ at: 0, preset: single(text) }];
  const out: Schedule = [];
  for (const [i, part] of parts.entries()) {
    const mark = part.indexOf('@');
    const head = mark < 0 ? part : part.slice(0, mark);
    const raw = mark < 0 ? '' : part.slice(mark + 1);
    const at = i === 0 ? 0 : Number(raw);
    const prev = out[i - 1]?.at ?? 0;
    const tickOk = i === 0 ? mark < 0 : raw !== '' && Number.isInteger(at) && at > prev;
    if (!tickOk || !(baseOf(head) in PRESETS)) throw new Error('bad preset schedule ' + name);
    out.push({ at, preset: single(head) });
  }
  return out;
}

export function presetAt(s: Schedule, t: number): Preset {
  let current = s[0];
  for (const step of s) if (step.at <= t) current = step;
  if (!current) throw new Error('empty preset schedule');
  return current.preset;
}

export function presetOf(name: string): Preset {
  return name in SCHEDULES || name.includes('>') || name.includes('@') ? presetAt(scheduleOf(name), 0) : single(name);
}
