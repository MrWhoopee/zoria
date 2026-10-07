import { readRunLog } from '@zoria/protocol';
import { fmtScore, fmtShares } from '../anchors.ts';
import { Channel } from './channel.ts';
import { compare } from './compare.ts';
import { Diary } from './diary.ts';
import { focusSlot, slotOfNick } from './names.ts';
import type { PackSummary } from './names.ts';
import { diffCount, manifestNeedles, ownerTruth } from './truth.ts';
import type { TruthAt } from './truth.ts';

export type Mode = 'truth' | 'belief' | 'both';

export interface LiveView {
  cap: number;
  state: 'live' | 'end';
  shares: number[] | null;
  score: number | null;
}

export interface View {
  pack: string | null;
  match: number;
  tick: number;
  mode: Mode;
  focus: string;
  cell: string;
  unit: string;
  order: number;
  promote: string;
  live: LiveView | null;
}

export interface MatchData {
  ticks: number;
  roster: string[];
  needles: string[];
  diary: Diary | null;
  bytes: Uint8Array;
  channels: Map<string, Channel>;
}

export interface PackData {
  id: string;
  summary: PackSummary;
  matches: MatchData[];
}

export function initial(): View {
  return { pack: null, match: 1, tick: 0, mode: 'truth', focus: '', cell: '', unit: '', order: 0, promote: '', live: null };
}

export function packData(id: string, packJson: string, runlogs: Uint8Array[], diaries: (string | null)[]): PackData {
  const summary = JSON.parse(packJson) as PackSummary;
  const matches = runlogs.map((bytes, i) => {
    const log = readRunLog(bytes);
    const text = diaries[i];
    return { ticks: summary.ticks, roster: log.roster, needles: manifestNeedles(bytes), diary: text ? new Diary(text) : null, bytes, channels: new Map<string, Channel>() };
  });
  return { id, summary, matches };
}

export function channelOf(m: MatchData, slot: string): Channel {
  const hit = m.channels.get(slot);
  if (hit) return hit;
  const c = new Channel(m.bytes, slot);
  m.channels.set(slot, c);
  return c;
}

export function slotOf(v: View, data: PackData): string {
  const m = data.matches[v.match - 1];
  return (m ? slotOfNick(m.roster, focusNick(v, data)) : null) ?? focusSlot(data.summary, v.match);
}

const comparisons = new WeakMap<PackData, ReturnType<typeof compare>>();

function comparisonOf(pair: { a: PackData; b: PackData }): ReturnType<typeof compare> {
  const hit = comparisons.get(pair.a);
  if (hit) return hit;
  const c = compare(pair.a.summary, pair.b.summary, [pair.a.id, pair.b.id]);
  comparisons.set(pair.a, c);
  return c;
}

export function focusNick(v: View, data: PackData | null): string {
  return v.focus || data?.summary.belief?.nick || '';
}

export function derive(v: View, data: PackData | null, truth: TruthAt | null, pair: { a: PackData; b: PackData } | null): Record<string, string> {
  const out: Record<string, string> = {};
  const nick = focusNick(v, data);
  out['tick'] = String(v.tick);
  out['match'] = v.live ? '-' : String(v.match);
  out['mode'] = v.mode;
  out['focus'] = nick;
  out['cell'] = v.cell;
  out['promote-status'] = v.promote || '-';
  out['live-lag'] = v.live ? String(Math.max(0, v.live.cap - v.tick)) : '-';
  out['live-state'] = v.live ? v.live.state : '-';
  const m = data?.matches[v.match - 1];
  const ok = truth !== null && truth.t === v.tick;
  for (const k of ['cell-owner-truth', 'cell-owner-belief', 'ghost-cell', 'ghost-age', 'diff-count', 'dark-count', 'score', 'needles', 'shares', 'bytes', 'orders', 'denied', 'deny-word', 'deny-top-tick', 'ab-winner', 'ab-diff', 'ab-top']) out[k] = '';
  if (pair) {
    const c = comparisonOf(pair);
    out['ab-winner'] = c.winner;
    out['ab-diff'] = c.diff(v.match);
    out['ab-top'] = c.top(v.match);
  }
  if (v.live && v.live.score !== null) out['score'] = fmtScore(v.live.score);
  if (v.live && v.live.shares) out['shares'] = fmtShares(v.live.shares);
  if (!data || !m) return out;
  out['shares'] = v.live ? out['shares'] ?? '' : fmtShares(data.summary.shares);
  const slot = slotOfNick(m.roster, nick) ?? focusSlot(data.summary, v.match);
  const own = nick === data.summary.belief?.nick ? m.diary : null;
  if (v.cell && ok) out['cell-owner-truth'] = ownerTruth(truth.owners, v.cell, m.roster);
  if (v.cell) out['cell-owner-belief'] = own ? own.ownerAt(v.cell, v.tick, m.roster) : '?';
  if (v.unit) {
    const g = own && v.unit !== '-' ? own.ghost(v.unit, v.tick) : null;
    out['ghost-cell'] = g ? g.cell : '-';
    out['ghost-age'] = g ? String(g.age) : '-';
  }
  if (own) out['dark-count'] = String(own.darkCount(v.tick, m.needles));
  if (own && ok) out['diff-count'] = String(diffCount(truth.owners, own.at(v.tick).own, m.needles));
  if (ok && !v.live) {
    out['score'] = fmtScore(truth.score[slot] ?? 0);
    out['needles'] = String(truth.needles[slot] ?? 0);
  }
  const ch = channelOf(m, slot).at(v.tick);
  out['bytes'] = String(ch.bytes);
  out['orders'] = String(ch.orders);
  out['denied'] = String(ch.denied);
  out['deny-word'] = channelOf(m, slot).denyWord(v.tick, v.order);
  out['deny-top-tick'] = String(channelOf(m, slot).worstTick());
  return out;
}
