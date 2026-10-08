import { createEngine } from '@zoria/engine';
import { decodeManifest, readRunLog } from '@zoria/protocol';
import { openJournal } from '@zoria/sdk';
import type { JournalCursor } from '@zoria/sdk';
import { nickOfSlot } from './names.ts';

export type UnitAt = [string, string, string, number, number];

export interface TruthAt {
  t: number;
  owners: Record<string, string | null>;
  score: Record<string, number>;
  needles: Record<string, number>;
  units: UnitAt[];
  links: Record<string, number[]>;
  jam: string[];
  scans: [string, number, number, number][];
  order: string[];
}

interface World {
  own: Record<string, string | null>;
  needles: Record<string, number>;
  jam: Record<string, { until: number }>;
  scan: Record<string, { q: number; r: number; rad: number } | null>;
}

interface Inside {
  SIM: { world: World; units: { id: string; p: string; cls: string; q: number; r: number; from: number; until: number }[]; order: { cells: string[]; from: number; to: number } | null };
  TERRAIN: { cells: Record<string, string> };
  simScoreBreakdown(p: string): { total: number };
  linkTree(p: string, w: World): { aq: number; ar: number; bq: number; br: number }[];
}

const SLOTS = ['A', 'B', 'C'];

export class Truth {
  private readonly cursor: JournalCursor;

  constructor(bytes: Uint8Array) {
    this.cursor = openJournal(createEngine, bytes);
  }

  get ticks(): number {
    return this.cursor.ticks;
  }

  at(t: number): TruthAt {
    const tick = Math.max(0, Math.min(this.cursor.ticks, Math.round(t)));
    this.cursor.seek(tick);
    return sceneOf(this.cursor.engine, this.cursor.t());
  }

  land(): [string, string][] {
    const E = this.cursor.engine as unknown as Inside;
    return Object.entries(E.TERRAIN.cells).filter(([, type]) => type !== 'bare');
  }
}

export function sceneOf(engine: unknown, t0: number): TruthAt {
  const E = engine as Inside;
  const w = E.SIM.world;
  const score: Record<string, number> = {};
  const needles: Record<string, number> = {};
  const links: Record<string, number[]> = {};
  for (const s of SLOTS) {
    score[s] = E.simScoreBreakdown(s).total;
    needles[s] = w.needles[s] ?? 0;
    links[s] = E.linkTree(s, w).flatMap((l) => [l.aq, l.ar, l.bq, l.br]);
  }
  const units = E.SIM.units.filter((u) => u.from <= t0 && t0 < u.until).map((u): UnitAt => [u.id, u.p, u.cls, u.q, u.r]);
  const jam = Object.keys(w.jam).filter((k) => (w.jam[k]?.until ?? 0) > t0);
  const scans: [string, number, number, number][] = [];
  for (const [p, sc] of Object.entries(w.scan)) if (sc) scans.push([p, sc.q, sc.r, sc.rad]);
  const o = E.SIM.order;
  const order = o && o.from <= t0 && t0 <= o.to ? [...o.cells] : [];
  return { t: t0, owners: { ...w.own }, score, needles, units, links, jam, scans, order };
}

export function ownerTruth(owners: Record<string, string | null>, cell: string, roster: readonly string[]): string {
  const o = owners[cell];
  return o === null || o === undefined ? '-' : nickOfSlot(roster, o);
}

export function diffCount(owners: Record<string, string | null>, belief: Map<string, string | null>, needles: readonly string[]): number {
  let n = 0;
  for (const k of needles) {
    if (!belief.has(k)) continue;
    if ((belief.get(k) ?? null) !== (owners[k] ?? null)) n++;
  }
  return n;
}

export function manifestNeedles(bytes: Uint8Array): string[] {
  const m = decodeManifest(readRunLog(bytes).manifest);
  if (!m) return [];
  return [...new Set(m.needles.map((n) => n.q + ',' + n.r))];
}
