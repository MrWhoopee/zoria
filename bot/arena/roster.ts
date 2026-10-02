import { ARCHETYPES } from '@zoria/sdk';
import type { WireBot } from '@zoria/sdk';
import { createStrategy, presets } from '../src/strategy.ts';

const archetypes = ARCHETYPES as Record<string, Record<string, unknown>>;

export function rivalNames(): string[] {
  return [...presets(), ...Object.keys(archetypes)];
}

export function rivalSeat(name: string): { bot?: WireBot; style?: Record<string, unknown> } {
  if (presets().includes(name)) return { bot: createStrategy(name) };
  const style = archetypes[name];
  if (style) return { style: { ...style } };
  throw new Error('unknown rival ' + name);
}
