import { parseArgs } from 'node:util';
import { createEngine } from '@zoria/engine';
import { openMatch } from '@zoria/sdk';
import type { WireBot } from '@zoria/sdk';
import type { SlotName } from '@zoria/protocol';
import { seatOf } from './league/roster.ts';

interface Unit {
  id: string;
  p: string;
  cls: string;
  from: number;
  until: number;
  task: unknown;
}

interface LogEvent {
  t: number;
  type: string;
  p?: string;
  from?: string | null;
  why?: string;
  cls?: string;
  q?: number;
  r?: number;
  bonus?: number;
  tgt?: string;
}

interface Inside {
  SIM: {
    units: Unit[];
    log: LogEvent[];
    world: {
      needles: Record<string, number>;
      lit: Record<string, Record<string, number>>;
      minutes: Record<string, number>;
      energy: Record<string, number>;
    };
  };
}

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '101' },
    cast: { type: 'string', default: 'основний,рівний,обхідник' },
    match: { type: 'string', default: '1' },
    every: { type: 'string', default: '100' },
  },
});

const SLOTS: SlotName[] = ['A', 'B', 'C'];
const cast = values.cast.split(',').map((x) => x.trim());
const k = Number(values.match);
const every = Number(values.every);
const bots: Partial<Record<SlotName, WireBot>> = {};
const styles: Partial<Record<SlotName, Record<string, unknown>>> = {};
const name: Record<string, string> = {};
cast.forEach((n, i) => {
  const slot = SLOTS[(i + k - 1) % 3] ?? 'A';
  const seat = seatOf(n);
  if (seat.bot) bots[slot] = seat.bot();
  if (seat.style) styles[slot] = seat.style;
  name[slot] = n;
});
const out = (line: string): void => {
  process.stdout.write(line + '\n');
};

const m = openMatch(createEngine, { seed: Number(values.seed), ticks: 1200, bots, styles });
const E = m.engine as unknown as Inside;
out('жереб ' + values.seed + ', партія ' + k + ': ' + SLOTS.map((s) => s + '=' + name[s]).join(' '));
out('такт  ' + SLOTS.map((s) => (s + ' ' + name[s]).slice(0, 34).padEnd(34)).join(' '));
while (!m.done()) {
  m.step();
  const t = m.t();
  if (t % every !== 0 && t !== 1200) continue;
  const w = E.SIM.world;
  const cols = SLOTS.map((p) => {
    const us = E.SIM.units.filter((u) => u.p === p && u.from <= t && u.until >= t);
    const tk = us.filter((u) => u.cls === 'ткач');
    const idle = tk.filter((u) => !u.task).length;
    return ('хв ' + Math.round(w.minutes[p] ?? 0) + ' г ' + Object.keys(w.lit[p] ?? {}).length + '/' + (w.needles[p] ?? 0) + ' Т' + tk.length + (idle ? '(' + idle + 'в)' : '') + ' К' + (us.length - tk.length) + ' з' + Math.round(w.energy[p] ?? 0)).padEnd(34);
  });
  out(String(t).padStart(4) + '  ' + cols.join(' '));
}
const log = E.SIM.log;
out('');
out('захоплення (хто <- у кого): ');
const caps: Record<string, number> = {};
for (const e of log.filter((x) => x.type === 'cap')) {
  const key = (e.p ?? '?') + '<-' + (e.from ?? 'руїна');
  caps[key] = (caps[key] ?? 0) + 1;
}
out('  ' + Object.entries(caps).sort().map(([a, b]) => a + ' ' + b).join(', '));
out('втрати машин:');
for (const p of SLOTS) {
  const lost = log.filter((x) => x.type === 'lost' && x.p === p);
  const why: Record<string, number> = {};
  for (const e of lost) why[(e.cls ?? '') + ' ' + (e.why ?? '')] = (why[(e.cls ?? '') + ' ' + (e.why ?? '')] ?? 0) + 1;
  out('  ' + p + ' ' + name[p] + ': ' + (lost.length ? Object.entries(why).map(([a, b]) => a + ' ' + b).join(', ') : 'немає'));
}
out('тарани: ' + SLOTS.map((p) => p + ' ' + log.filter((x) => x.type === 'ram' && x.p === p).length).join(', '));
out('завади: ' + SLOTS.map((p) => p + ' ' + log.filter((x) => x.type === 'jam' && x.p === p).length).join(', '));
out('замовлення виконано: ' + SLOTS.map((p) => p + ' ' + log.filter((x) => x.type === 'orderDone' && x.p === p).length).join(', ') + ' з ' + log.filter((x) => x.type === 'order').length);
out('кільце після зорі: ' + SLOTS.map((p) => p + ' ' + log.filter((x) => x.type === 'cap' && x.from === 'K' && x.p === p && x.t >= 1000).length).join(', '));
out('рахунок: ' + SLOTS.map((p) => p + ' ' + (m.summary().score[p] ?? 0).toFixed(1)).join(', '));
