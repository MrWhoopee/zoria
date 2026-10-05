import type { ArenaFrame, ArenaMap, ArenaUnit } from '../../bot/arena/frame.ts';
import type { GeneralCommand } from '../../bot/src/general.ts';

export interface MenuItem {
  label: string;
  command: GeneralCommand;
}

type Hex = { q: number; r: number };

const NO_BUILD = new Set(['water', 'mount']);

export function menuItems(frame: ArenaFrame, map: ArenaMap, cell: Hex, unit: ArenaUnit | null): MenuItem[] {
  const slot = map.slot;
  const owner = frame.own[cell.q + ',' + cell.r];
  const shielded = map.starts.some((s) => s.q === cell.q && s.r === cell.r);
  const foeNeedle = owner !== undefined && owner !== null && owner !== slot && owner !== 'K' && !shielded;
  const terrain = map.cells.find((c) => c[0] === cell.q && c[1] === cell.r)?.[2];
  const empty = owner === undefined && terrain !== undefined && !NO_BUILD.has(terrain);
  const keeperOpen = (frame.t ?? 0) >= map.dawnAt;
  const takeable = owner !== undefined && owner !== slot && !shielded && (owner !== 'K' || keeperOpen);
  const foe = frame.foe.find((f) => f[3] === cell.q && f[4] === cell.r);
  if (!unit) {
    const out: MenuItem[] = [];
    if (takeable) out.push({ label: 'Наказ: захопити цю голку', command: { kind: 'goal', goal: 'take', cell } });
    if (foeNeedle) out.push({ label: 'Наказ: глушити цю голку', command: { kind: 'goal', goal: 'jam', cell } });
    if (foe) out.push({ label: 'Наказ: таранити ' + foe[0], command: { kind: 'goal', goal: 'ram', target: foe[0] } });
    if (empty) out.push({ label: 'Наказ: будувати тут', command: { kind: 'goal', goal: 'build', cell } });
    return out;
  }
  const id = unit.id;
  const home = map.seats[slot];
  const out: MenuItem[] = [unit.manual ? { label: 'Відпустити', command: { kind: 'release', unit: id } } : { label: 'Перехопити', command: { kind: 'take', unit: id } }];
  out.push({ label: 'Рух', command: { kind: 'order', order: { kind: 'move', unit: id, q: cell.q, r: cell.r, goal: null, home: false } } });
  if (unit.cls === 'ткач' && takeable) out.push({ label: 'Захопити', command: { kind: 'order', order: { kind: 'move', unit: id, q: cell.q, r: cell.r, goal: { q: cell.q, r: cell.r }, home: false } } });
  if (unit.cls === 'ткач' && empty) out.push({ label: 'Будувати', command: { kind: 'order', order: { kind: 'needle', unit: id, q: cell.q, r: cell.r } } });
  if (unit.cls === 'клинок' && foeNeedle) out.push({ label: 'Глушити', command: { kind: 'order', order: { kind: 'jam', unit: id, target: cell, hold: true } } });
  if (unit.cls === 'клинок' && foe) out.push({ label: 'Таран', command: { kind: 'order', order: { kind: 'ram', unit: id, target: foe[0] } } });
  out.push({ label: 'Стоп', command: { kind: 'order', order: { kind: 'halt', unit: id } } });
  out.push({ label: 'Додому', command: { kind: 'order', order: { kind: 'move', unit: id, q: home.q, r: home.r, goal: null, home: true } } });
  return out;
}
