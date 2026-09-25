import type { Mark } from '../../protocol/ether.ts';
import type { Snapshot } from '../agent/snapshot.ts';
import type { AccountView } from '../../agent/local-api.ts';
import { describeFailure } from './errors.ts';

const GLYPH: Record<Mark, string> = { signal: '│', noise: '░', forgery: '✗', silence: '·', jam: '!' };

export function ribbonGlyphs(ribbon: Mark[], width: number): string {
  return ribbon.slice(-width).map((m) => GLYPH[m]).join('');
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export function formatLocal(epochMs: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(epochMs));
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}.${get('month')} ${get('hour')}:${get('minute')}`;
}

export function whenLocal(iso: string | null, zone: string): string {
  if (iso === null) return '-';
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? '-' : `${formatLocal(ms, zone)} ${zone}`;
}

export function accountLines(a: AccountView, zone: string): string[] {
  const s = a.session;
  if (s.state === 'none') return [];
  const lines: string[] = [];
  if (s.state === 'active') lines.push(`SESSION  until ${whenLocal(s.expiresAt, zone)}`);
  else if (s.state === 'logged-out') lines.push('SESSION  logged out   type LOGIN');
  else if (s.state === 'rejected') lines.push('SESSION  REJECTED   type LOGIN');
  else lines.push('SESSION  signing in...');
  const unread = a.summary?.unread ?? a.inbox.filter((m) => m.readAt === null).length;
  const parts = a.summary?.releasedStages ?? a.stages.length;
  const repo = a.repository ? a.repository.accessStatus.toUpperCase() : 'NONE';
  lines.push(`MAIL ${unread} NEW   PARTS ${parts}   REPO ${repo}`);
  if (a.lastError) {
    const [head, ...rest] = describeFailure(a.lastError);
    lines.push(`ERROR    ${a.lastError.what}: ${head}`, ...rest);
  }
  return lines;
}

export function statusLines(s: Snapshot | null, nowMs: number, timeZone: string): string[] {
  if (s === null) return ['AGENT    OFFLINE', 'start the agent: npm run agent'];
  const e = s.ether;
  const registered = s.account !== undefined && s.account.session.state !== 'none';
  const lines = [`PHASE    ${(e.phase ?? 'unknown').toUpperCase()}`];
  if (!registered) {
    if (e.phase === 'window' && e.closesAt !== null) {
      lines.push(`CLOSES   ${formatLocal(e.closesAt, timeZone)} ${timeZone}`);
    } else if (s.msUntilOpen !== null && s.msUntilOpen <= 0 && e.closesAt !== null && e.closesAt <= nowMs) {
      lines.push(`CLOSED   ${formatLocal(e.closesAt, timeZone)} ${timeZone}`);
    } else if (s.msUntilOpen !== null && s.msUntilOpen > 0 && e.opensAt !== null) {
      lines.push(`OPENS    in ${formatDuration(s.msUntilOpen)}`);
      lines.push(`         ${formatLocal(e.opensAt, timeZone)} ${timeZone}`);
    } else {
      lines.push('OPENS    unknown');
    }
  }
  if (e.silentUntil > nowMs) {
    const label = e.silentWhy === 'stop' ? 'PAUSED  ' : 'JAMMED  ';
    lines.push(`${label} ${Math.ceil((e.silentUntil - nowMs) / 1000)}s`);
  }
  lines.push(`SIGNAL   ${ribbonGlyphs(e.ribbon, 36)}`);
  if (!registered) lines.push(`REGISTER ${s.registrar}${s.blockedReason ? ` (${s.blockedReason})` : ''}`);
  if (s.account) lines.push(...accountLines(s.account, timeZone));
  if (e.fragmentsOf !== null) {
    const earlier = e.archive.length > 0 ? `  +${e.archive.length} EARLIER` : '';
    lines.push(`LETTER   ${Object.keys(e.fragments).length}/${e.fragmentsOf}${earlier}`);
  }
  return lines;
}
