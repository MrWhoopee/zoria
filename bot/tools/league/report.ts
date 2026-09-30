import { kindOf } from './roster.ts';
import { headToHead, standings, worst } from './table.ts';
import type { PackRecord } from './table.ts';

const pad = (s: string | number, n: number): string => String(s).padStart(n);
const fix = (x: number): string => x.toFixed(1);

export function report(records: PackRecord[], players: string[]): string[] {
  const out: string[] = [];
  const st = standings(records);
  out.push('пакетів: ' + records.length);
  out.push('учасник'.padEnd(34) + pad('пакетів', 8) + pad('частка/9', 9) + pad('перших', 8) + pad('мережа', 8) + pad('замовл', 8) + pad('вкрадено', 9) + pad('завад', 7) + pad('таранів', 8));
  for (const s of st) {
    out.push((s.name + ' [' + kindOf(s.name) + ']').padEnd(34) + pad(s.packs, 8) + pad(s.mean.toFixed(2), 9) + pad(Math.round((100 * s.firsts) / s.packs) + '%', 8) + pad(fix(s.network), 8) + pad(fix(s.orders), 8) + pad(fix(s.stolen), 9) + pad(fix(s.jams), 7) + pad(fix(s.rams), 8));
  }
  for (const p of players) {
    out.push('');
    out.push(p + ' проти кожного (середня різниця часток за пакет):');
    for (const s of st) {
      if (s.name === p) continue;
      const h = headToHead(records, p, s.name);
      if (h.packs > 0) out.push('  ' + s.name.padEnd(32) + pad((h.diff >= 0 ? '+' : '') + h.diff.toFixed(2), 7) + pad('(' + h.packs + ')', 6));
    }
    out.push('  найгірші пакети:');
    for (const r of worst(records, p, 3)) out.push('    жереб ' + r.seed + ' ' + r.cast.join(', ') + ' -> ' + r.shares.join('/'));
  }
  return out;
}

export function readRecords(text: string): PackRecord[] {
  return text
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as PackRecord);
}
