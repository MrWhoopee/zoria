import { ARCHETYPES } from '@zoria/sdk';
import type { PackSeat } from '@zoria/sdk';
import { NAKAZ_SAMPLES, createNakazSparring } from '@zoria/sdk/nakaz';
import { PRESETS } from '../../src/preset.ts';
import { createStrategy } from '../../src/strategy.ts';

export type SeatKind = 'preset' | 'archetype' | 'mutant' | 'nakaz';

const archetypes = ARCHETYPES as Record<string, Record<string, unknown>>;
const samples = NAKAZ_SAMPLES as Record<string, string>;

export function kindOf(name: string): SeatKind {
  if (name in PRESETS) return 'preset';
  if (name in archetypes) return 'archetype';
  if (name in samples) return 'nakaz';
  const base = name.split('+')[0] ?? '';
  if (name.includes('+') && base in archetypes) return 'mutant';
  throw new Error('unknown participant ' + name);
}

function mutant(name: string): Record<string, unknown> {
  const [base, ...knobs] = name.split('+');
  const style: Record<string, unknown> = { ...archetypes[base ?? ''] };
  for (const k of knobs) {
    const [key, value] = k.split('=');
    const num = Number(value);
    if (!key || value === undefined || Number.isNaN(num)) throw new Error('bad knob ' + k + ' in ' + name);
    style[key] = num;
  }
  return style;
}

export function seatOf(name: string): PackSeat {
  const kind = kindOf(name);
  if (kind === 'preset') return { bot: () => createStrategy(name) };
  if (kind === 'archetype') return { style: { ...archetypes[name] } };
  if (kind === 'mutant') return { style: mutant(name) };
  const text = samples[name] ?? '';
  return { bot: () => createNakazSparring(text) };
}

export const ARCHETYPE_NAMES = Object.keys(archetypes);
export const NAKAZ_NAMES = Object.keys(samples);
