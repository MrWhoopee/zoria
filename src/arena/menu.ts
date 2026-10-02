import type { SlotName } from '@zoria/protocol';
import type { ArenaFrame, ArenaUnit } from '../../bot/arena/frame.ts';
import type { GeneralCommand } from '../../bot/src/general.ts';

export interface MenuItem {
  label: string;
  command: GeneralCommand;
}

type Hex = { q: number; r: number };

export function menuItems(frame: ArenaFrame, slot: SlotName, seats: Record<SlotName, Hex>, cell: Hex, unit: ArenaUnit | null): MenuItem[] {
  const owner = frame.own[cell.q + ',' + cell.r];
  const foeNeedle = owner !== undefined && owner !== null && owner !== slot && owner !== 'K';
  const empty = owner === undefined;
  const foe = frame.foe.find((f) => f[3] === cell.q && f[4] === cell.r);
  if (!unit) {
    const out: MenuItem[] = [];
    if (foeNeedle) out.push({ label: 'Наказ: глушити цю голку', command: { kind: 'goal', goal: 'jam', cell } });
    if (foe) out.push({ label: 'Наказ: таранити ' + foe[0], command: { kind: 'goal', goal: 'ram', target: foe[0] } });
    if (empty) out.push({ label: 'Наказ: будувати тут', command: { kind: 'goal', goal: 'build', cell } });
    return out;
  }
  const id = unit.id;
  const home = seats[slot];
  const out: MenuItem[] = [unit.manual ? { label: 'Відпустити', command: { kind: 'release', unit: id } } : { label: 'Перехопити', command: { kind: 'take', unit: id } }];
  out.push({ label: 'Рух', command: { kind: 'order', order: { kind: 'move', unit: id, q: cell.q, r: cell.r, goal: null, home: false } } });
  if (unit.cls === 'ткач' && empty) out.push({ label: 'Будувати', command: { kind: 'order', order: { kind: 'needle', unit: id, q: cell.q, r: cell.r } } });
  if (unit.cls === 'клинок' && foeNeedle) out.push({ label: 'Глушити', command: { kind: 'order', order: { kind: 'jam', unit: id, target: cell, hold: true } } });
  if (unit.cls === 'клинок' && foe) out.push({ label: 'Таран', command: { kind: 'order', order: { kind: 'ram', unit: id, target: foe[0] } } });
  out.push({ label: 'Стоп', command: { kind: 'order', order: { kind: 'halt', unit: id } } });
  out.push({ label: 'Додому', command: { kind: 'order', order: { kind: 'move', unit: id, q: home.q, r: home.r, goal: null, home: true } } });
  return out;
}
