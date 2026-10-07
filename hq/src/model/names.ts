export interface Breakdown {
  total: number;
  network: number;
  orders: number;
  stolen: number;
  pactTax: number;
  jams?: number;
  rams?: number;
}

export interface PackSummary {
  seed: number;
  ticks: number;
  shares: number[];
  rotations: string[][];
  roster: string[];
  breakdown: Breakdown[];
  matches: { file: string; score: Record<string, number>; breakdown: Record<string, Breakdown> }[];
  belief?: { seat: number; nick: string; files: string[] };
}

export const SLOTS = ['A', 'B', 'C'] as const;

export function focusSlot(pack: PackSummary, match: number): string {
  return pack.rotations[match - 1]?.[pack.belief?.seat ?? 0] ?? 'A';
}

export function nickOfSlot(roster: readonly string[], slot: string): string {
  if (slot === 'K') return 'K';
  const i = SLOTS.indexOf(slot as (typeof SLOTS)[number]);
  return i < 0 ? slot : roster[i] ?? slot;
}

export function slotOfNick(roster: readonly string[], nick: string): string | null {
  const i = roster.indexOf(nick);
  return i < 0 ? null : SLOTS[i] ?? null;
}
