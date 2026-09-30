export interface Preset {
  name: string;
  tkachTarget: number;
  buildReserve: number;
  etaPower: number;
  feed: boolean;
  harm: number;
  unlock: number;
}

export const PRESETS: Record<string, Preset> = {
  основний: { name: 'основний', tkachTarget: 3, buildReserve: 0, etaPower: 1, feed: false, harm: 0.5, unlock: 0.5 },
  широкий: { name: 'широкий', tkachTarget: 4, buildReserve: 0, etaPower: 0.8, feed: false, harm: 0.5, unlock: 0.5 },
  ближній: { name: 'ближній', tkachTarget: 3, buildReserve: 0, etaPower: 1.5, feed: false, harm: 0.5, unlock: 0.5 },
  скупий: { name: 'скупий', tkachTarget: 2, buildReserve: 60, etaPower: 1, feed: false, harm: 0.5, unlock: 0.5 },
};

export function presetOf(name: string): Preset {
  return PRESETS[name] ?? PRESETS['основний'] ?? { name: 'основний', tkachTarget: 3, buildReserve: 0, etaPower: 1, feed: false, harm: 0.5, unlock: 0.5 };
}
