export type FlickerEvent = { lamp: string; depth: number; durationMs: number };

export type FlickerOptions = {
  chance: number;
  minDepth: number;
  maxDepth: number;
  minMs: number;
  maxMs: number;
};

export const DEFAULT_FLICKER: FlickerOptions = { chance: 0.07, minDepth: 0.2, maxDepth: 0.5, minMs: 50, maxMs: 140 };

export function planFlickers(lamps: readonly string[], rand: () => number, o: FlickerOptions = DEFAULT_FLICKER): FlickerEvent[] {
  const out: FlickerEvent[] = [];
  for (const lamp of lamps) {
    if (rand() >= o.chance) continue;
    out.push({
      lamp,
      depth: o.minDepth + rand() * (o.maxDepth - o.minDepth),
      durationMs: Math.round(o.minMs + rand() * (o.maxMs - o.minMs)),
    });
  }
  return out;
}

export const DARKNESS_OFF = 0.84;

export const POWER_ON_DARKNESS: ReadonlyArray<readonly [number, number]> = [
  [0.5, 70], [0.8, 90], [0.35, 60], [0.72, 140], [0.2, 80], [0.55, 110], [0.1, 90], [0, 0],
];

export function meterLevels(count: number, rand: () => number): number[] {
  return Array.from({ length: count }, () => 0.35 + rand() * 0.65);
}
