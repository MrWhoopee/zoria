import type { SlotName } from '@zoria/protocol';
import type { ArenaRecord } from '../../arena/record.ts';
import type { GeneralCommand } from '../../src/general.ts';

const SLOTS: SlotName[] = ['A', 'B', 'C'];
const GOAL: Record<string, string> = { jam: 'глушити', ram: 'таранити', build: 'будувати' };

interface Run {
  final: { score: [number, number, number]; place: number; t: number };
  scores: [number, number, number][];
}

export function describe(c: GeneralCommand): string {
  if (c.kind === 'take') return 'перехопив ' + c.unit;
  if (c.kind === 'release') return 'відпустив ' + c.unit;
  if (c.kind === 'cancel') return 'скасував наказ ' + c.id;
  if (c.kind === 'yard') return 'верф: ' + (c.cls ?? 'як вирішить бот');
  if (c.kind === 'goal') return 'наказ боту: ' + (GOAL[c.goal] ?? c.goal) + ' ' + (c.cell ? c.cell.q + ',' + c.cell.r : c.target ?? '?');
  const o = c.order;
  const unit = 'unit' in o ? o.unit : '?';
  if (o.kind === 'move') return unit + ': ' + (o.home ? 'додому' : 'рух на ' + o.q + ',' + o.r);
  if (o.kind === 'needle') return unit + ': будувати ' + o.q + ',' + o.r;
  if (o.kind === 'jam') return unit + ': глушити ' + (o.target ? o.target.q + ',' + o.target.r : '?');
  if (o.kind === 'ram') return unit + ': таран ' + o.target;
  if (o.kind === 'halt') return unit + ': стоп';
  return unit + ': ' + o.kind;
}

export function divergence(mine: [number, number, number][], alone: [number, number, number][], me: number): number | null {
  const n = Math.min(mine.length, alone.length);
  for (let i = 0; i < n; i++) if (Math.abs((mine[i]?.[me] ?? 0) - (alone[i]?.[me] ?? 0)) > 1e-9) return i + 1;
  return null;
}

const fix = (x: number): string => x.toFixed(1);
const signed = (x: number): string => (x >= 0 ? '+' : '') + x.toFixed(1);

export function review(rec: ArenaRecord, mine: Run, alone: Run): string[] {
  const me = SLOTS.indexOf(rec.slot);
  const my = mine.final.score[me] ?? 0;
  const solo = alone.final.score[me] ?? 0;
  const out: string[] = [];
  out.push('бій ' + rec.at + ': жереб ' + rec.seed + ', слот ' + rec.slot + ', твій бот ' + rec.preset + ', суперники ' + rec.rivals.join(' і '));
  out.push('команд: ' + rec.commands.length + (rec.end && !rec.end.done ? ', бій перервано на такті ' + rec.end.t : ''));
  if (rec.end && rec.end.done && Math.abs((rec.end.score[me] ?? 0) - my) > 1e-6) out.push('увага: відтворення не збігається із записом (' + fix(rec.end.score[me] ?? 0) + ' у записі), мабуть, бот змінився після бою');
  out.push('з тобою: ' + fix(my) + ', місце ' + mine.final.place + ' | бот сам: ' + fix(solo) + ', місце ' + alone.final.place + ' | різниця ' + signed(my - solo));
  out.push('суперники з тобою: ' + SLOTS.filter((s) => s !== rec.slot).map((s) => s + ' ' + fix(mine.final.score[SLOTS.indexOf(s)] ?? 0)).join(', ') + ' | без тебе: ' + SLOTS.filter((s) => s !== rec.slot).map((s) => s + ' ' + fix(alone.final.score[SLOTS.indexOf(s)] ?? 0)).join(', '));
  const d = divergence(mine.scores, alone.scores, me);
  out.push(d === null ? 'розходження немає: твої команди не змінили рахунку' : 'розходження з такту ' + d);
  out.push('команди (різниця з ботом наодинці через 100 тактів):');
  for (const x of rec.commands) {
    const at = Math.min(mine.scores.length, x.t + 100) - 1;
    const gap = (mine.scores[at]?.[me] ?? 0) - (alone.scores[at]?.[me] ?? 0);
    out.push('  t' + x.t + '  ' + describe(x.c) + '   [' + signed(gap) + ' на t' + (at + 1) + ']');
  }
  return out;
}
