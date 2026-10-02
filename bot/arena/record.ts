import type { SlotName } from '@zoria/protocol';
import type { GeneralCommand } from '../src/general.ts';

export interface ArenaEnd {
  t: number;
  done: boolean;
  score: [number, number, number];
  place: number;
}

export interface ArenaRecord {
  v: 1;
  at: string;
  seed: number;
  slot: SlotName;
  rivals: [string, string];
  preset: string;
  commands: { t: number; c: GeneralCommand }[];
  end: ArenaEnd | null;
}

export function isRecord(x: unknown): x is ArenaRecord {
  const r = x as Partial<ArenaRecord> | null;
  return !!r && r.v === 1 && typeof r.at === 'string' && typeof r.seed === 'number' && typeof r.slot === 'string' && Array.isArray(r.rivals) && r.rivals.length === 2 && typeof r.preset === 'string' && Array.isArray(r.commands);
}
