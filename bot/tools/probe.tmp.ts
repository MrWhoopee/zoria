import { createEngine } from '@zoria/engine';
import { openMatch } from '@zoria/sdk';
import type { WireBot } from '@zoria/sdk';
import type { SlotName } from '@zoria/protocol';
import { seatOf } from './league/roster.ts';

const casts = [['глушій-3', 'облягач', 'обхідник'], ['глушій-3', 'глушій-3', 'глушій-3']];
const SLOTS: SlotName[] = ['A', 'B', 'C'];
for (const cast of casts) {
  const acc = { ticks: 0, cap: 0, energy: 0, tIdle: 0, kIdle: 0, tN: 0, kN: 0, chanLow: 0, crownT: 0, crownN: 0, lit: 0 };
  const parts: Record<string, number> = {};
  for (let s = 0; s < 4; s++) {
    const bots: Partial<Record<SlotName, WireBot>> = {};
    const styles: Partial<Record<SlotName, Record<string, unknown>>> = {};
    cast.forEach((n, i) => { const seat = seatOf(n); if (seat.bot) bots[SLOTS[i]!] = seat.bot(); if (seat.style) styles[SLOTS[i]!] = seat.style; });
    const m = openMatch(createEngine, { seed: 8100 + s, ticks: 1200, bots, styles });
    const E = m.engine as any;
    while (!m.done()) {
      m.step();
      const t = m.t();
      if (t % 5) continue;
      const w = E.SIM.world;
      acc.ticks++;
      const en = w.energy.A ?? 0;
      acc.energy += en;
      const cr = Object.keys(w.crown?.A ?? {}).length;
      if (cr > 0) acc.crownT++;
      acc.crownN += cr;
      acc.lit += Object.keys(w.lit?.A ?? {}).length;
      if (en >= 350) acc.cap++;
      const U = E.SIM.units.filter((u: any) => u.p === 'A' && u.from <= t && t < u.until);
      for (const u of U) {
        const idle = !u.task || (!u.task.path?.length && !u.task.jam && !u.task.ram && !u.task.site && !u.task.feed);
        if (u.cls === 'ткач') { acc.tN++; if (idle && !u.work) acc.tIdle++; } else { acc.kN++; if (idle) acc.kIdle++; }
      }
    }
    const b = m.summary().breakdown.A as any;
    for (const [k, v] of Object.entries(b)) parts[k] = (parts[k] ?? 0) + (v as number) / 4;
  }
  console.log(cast.join(','), 'energy avg', (acc.energy / acc.ticks).toFixed(0), 'at cap %', ((100 * acc.cap) / acc.ticks).toFixed(0), 'crown ticks %', ((100 * acc.crownT) / acc.ticks).toFixed(0), 'crown share of lit %', ((100 * acc.crownN) / Math.max(1, acc.lit)).toFixed(0), 'Tkach idle %', ((100 * acc.tIdle) / acc.tN).toFixed(0), 'Klinok idle %', ((100 * acc.kIdle) / acc.kN).toFixed(0), JSON.stringify(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v)]))));
}
