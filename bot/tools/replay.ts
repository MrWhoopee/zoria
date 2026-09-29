import { readFileSync, writeFileSync } from 'node:fs';
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
  q: number;
  r: number;
  from: number;
  until: number;
}

interface Storm {
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  r: number;
}

interface Inside {
  SIM: {
    units: Unit[];
    world: {
      own: Record<string, string | null>;
      lit: Record<string, Record<string, number>>;
      jam: Record<string, { p: string }>;
      minutes: Record<string, number>;
      energy: Record<string, number>;
      dawn: number;
    };
  };
  STORMS: Storm[];
  FINDS: { q: number; r: number; kind: string }[];
  terrainAt(q: number, r: number): string;
  terrainLevel(q: number, r: number): number;
}

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '2026' },
    cast: { type: 'string', default: 'основний,рівний,обхідник' },
    match: { type: 'string', default: '1' },
    ticks: { type: 'string', default: '1200' },
    step: { type: 'string', default: '3' },
    out: { type: 'string', default: '' },
  },
});

const SLOTS: SlotName[] = ['A', 'B', 'C'];
const cast = values.cast.split(',').map((x) => x.trim());
const k = Number(values.match);
const seed = Number(values.seed);
const step = Math.max(1, Number(values.step));
const bots: Partial<Record<SlotName, WireBot>> = {};
const styles: Partial<Record<SlotName, Record<string, unknown>>> = {};
const names: Record<string, string> = {};
cast.forEach((name, i) => {
  const slot = SLOTS[(i + k - 1) % 3] ?? 'A';
  const seat = seatOf(name);
  if (seat.bot) bots[slot] = seat.bot();
  if (seat.style) styles[slot] = seat.style;
  names[slot] = name;
});

const m = openMatch(createEngine, { seed, ticks: Number(values.ticks), bots, styles });
const E = m.engine as unknown as Inside;
const cells: [number, number, string, number][] = [];
for (let q = -19; q <= 19; q++) {
  for (let r = -19; r <= 19; r++) {
    if ((Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2 > 19) continue;
    cells.push([q, r, E.terrainAt(q, r), E.terrainLevel(q, r)]);
  }
}
const frames: unknown[] = [];
while (!m.done()) {
  m.step();
  const t = m.t();
  if (t % step !== 1 % step) continue;
  const w = E.SIM.world;
  const lit = new Set<string>();
  for (const p of ['A', 'B', 'C', 'K']) for (const key of Object.keys(w.lit[p] ?? {})) lit.add(key);
  frames.push({
    t,
    n: Object.entries(w.own).map(([key, o]) => [key, o, lit.has(key) ? 1 : 0, w.jam[key]?.p ?? 0]),
    u: E.SIM.units.filter((u) => u.from <= t && u.until >= t).map((u) => [u.id, u.p, u.cls === 'ткач' ? 0 : 1, u.q, u.r]),
    m: SLOTS.map((p) => Number((w.minutes[p] ?? 0).toFixed(1))),
    e: SLOTS.map((p) => Math.round(w.energy[p] ?? 0)),
    d: w.dawn ? 1 : 0,
    st: E.STORMS.map((s) => [Number((s.x0 + s.vx * t).toFixed(2)), Number((s.y0 + s.vy * t).toFixed(2)), Number(s.r.toFixed(2))]),
  });
}
const sum = m.summary();
const data = {
  title: 'Жереб ' + seed + ', партія ' + k + ': ' + SLOTS.map((s) => names[s]).join(' / '),
  sub: 'Рахунок: ' + SLOTS.map((s) => names[s] + ' ' + (sum.score[s] ?? 0).toFixed(1)).join(', ') + '. Кольори: A бурштин, B бірюза, C фіолет.',
  cells,
  finds: E.FINDS,
  frames,
  names,
};
const html = readFileSync(new URL('./viewer.html', import.meta.url), 'utf8').replace('__DATA__', () => JSON.stringify(data));
const out = values.out || 'league/replay-' + seed + '-' + k + '-' + cast.join('-') + '.html';
writeFileSync(out, html);
process.stdout.write('записано: ' + out + '\n');
