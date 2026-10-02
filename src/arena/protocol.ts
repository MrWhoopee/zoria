import type { SlotName } from '@zoria/protocol';
import type { ArenaFrame, ArenaMap, RevealFrame } from '../../bot/arena/frame.ts';
import type { ArenaRecord } from '../../bot/arena/record.ts';
import type { GeneralCommand } from '../../bot/src/general.ts';

export type ToWorker =
  | { kind: 'start'; seed: number; slot: SlotName; rivals: [string, string]; preset: string }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'step' }
  | { kind: 'speed'; x: number }
  | { kind: 'command'; c: GeneralCommand }
  | { kind: 'reveal' };

export type FromWorker =
  | { kind: 'names'; names: string[] }
  | { kind: 'map'; game: number; map: ArenaMap }
  | { kind: 'frame'; game: number; frame: ArenaFrame }
  | { kind: 'reveal'; game: number; reveal: RevealFrame }
  | { kind: 'record'; record: ArenaRecord }
  | { kind: 'error'; message: string };
