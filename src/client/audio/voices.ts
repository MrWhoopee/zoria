import type { FlickerEvent } from '../scene/flicker.ts';

export const HUM_LEVEL = 0.035;

export const HUM_PARTIALS: ReadonlyArray<{ hz: number; gain: number }> = [
  { hz: 50, gain: 1 },
  { hz: 100, gain: 0.5 },
  { hz: 150, gain: 0.25 },
  { hz: 200, gain: 0.12 },
];

export type Crackle = { peak: number; decayMs: number; cutoffHz: number };

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export function dipGain(depth: number): number {
  return 1 - clamp01(depth) * 0.8;
}

export function crackleParams(e: FlickerEvent, rand: () => number): Crackle {
  return {
    peak: 0.02 + clamp01(e.depth) * 0.06,
    decayMs: Math.max(20, Math.min(e.durationMs, 120)),
    cutoffHz: 1800 + rand() * 2600,
  };
}
