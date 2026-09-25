import { wrap } from '../text/wrap.ts';
import { markdownLines, parseMarkdown } from '../text/markdown.ts';
import { whenLocal } from './status.ts';
import type { Message, News, RepoAccess, Repository, StageSummary } from '../../agent/account.ts';
import type { RollEntry } from '../../protocol/types.ts';

const REASONS: Record<string, string> = {
  'marker-found': 'the .zoria file names your account',
  'marker-other': 'the .zoria file names another account',
  'marker-absent': 'invitation accepted, no .zoria file yet',
  'inviter-mismatch': 'the invitation came from another GitHub account',
};

const short = (iso: string | null, zone: string): string => whenLocal(iso, zone).replace(` ${zone}`, '');

export function numbered<T>(items: T[], at: (x: T) => string | null): Array<{ n: number; item: T }> {
  return [...items]
    .sort((a, b) => (at(a) ?? '').localeCompare(at(b) ?? ''))
    .map((item, i) => ({ n: i + 1, item }))
    .reverse();
}

export function mailList(inbox: Message[], zone: string): string[] {
  if (inbox.length === 0) return ['NO MAIL YET'];
  return numbered(inbox, (m) => m.createdAt)
    .map(({ n, item }) => `${item.readAt === null ? '●' : ' '} ${n} ${short(item.createdAt, zone)} ${item.title}`);
}

export function mailText(m: Message, zone: string, cols: number): string[] {
  const lines = [
    `FROM     ${m.notice?.type === 'repository' ? 'server notice' : 'organizers'}`,
    `DATE     ${whenLocal(m.createdAt, zone)}`,
    '',
    ...wrap(m.title.toUpperCase(), cols),
    '',
    ...markdownLines(parseMarkdown(m.body), cols),
  ];
  if (m.notice?.type === 'repository' && typeof m.notice.accessStatus === 'string') {
    lines.push('', `ACCESS   ${m.notice.accessStatus.toUpperCase()}`);
  }
  return lines;
}

export function newsList(news: News[], zone: string): string[] {
  if (news.length === 0) return ['NO NEWS YET'];
  return numbered(news, (x) => x.publishedAt)
    .map(({ n, item }) => `${n} ${short(item.publishedAt, zone)} ${item.title}${item.archivedAt ? ' (archived)' : ''}`);
}

export function newsText(item: News, zone: string, cols: number): string[] {
  return [
    `DATE     ${whenLocal(item.publishedAt, zone)}`,
    ...(item.updatedAt && item.updatedAt !== item.publishedAt ? [`EDITED   ${whenLocal(item.updatedAt, zone)}`] : []),
    '',
    ...wrap(item.title.toUpperCase(), cols),
    '',
    ...markdownLines(parseMarkdown(item.body), cols),
  ];
}

export function partsList(stages: StageSummary[], zone: string): string[] {
  if (stages.length === 0) return ['NO PARTS RELEASED YET', 'they arrive through the API only'];
  const lines: string[] = [];
  for (const s of stages) {
    const receipt = s.acknowledgedAt ? `ACK ${short(s.acknowledgedAt, zone)}` : 'NEW';
    const errata = s.errataAt ? `   ERRATA ${short(s.errataAt, zone)}` : '';
    lines.push(`${s.position}. ${s.title}`, `   given ${short(s.releasedAt, zone)}   ${receipt}${errata}`);
  }
  lines.push('', 'full text: the notebook on the desk', 'ACK N    acknowledge receipt of part N');
  return lines;
}

export function reasonText(r: Repository): string {
  if (r.reasonCode === 'organizer') return r.reason ?? '-';
  if (r.reasonCode !== null && REASONS[r.reasonCode]) return REASONS[r.reasonCode];
  return r.reason ?? '-';
}

export function repoLines(r: Repository | null, access: RepoAccess | null, username: string | null, zone: string, cols: number): string[] {
  const label = (key: string, text: string): string[] =>
    wrap(text, cols - 9).map((l, i) => (i === 0 ? `${key.padEnd(9)}${l}` : `${' '.repeat(9)}${l}`));
  const lines: string[] = [];
  if (r === null) lines.push('URL      none on file');
  else {
    lines.push(...label('URL', r.url), `STATUS   ${r.accessStatus.toUpperCase()}`, ...label('WHY', reasonText(r)));
    lines.push(`CHECKED  ${r.checkedAt === null ? 'not yet' : whenLocal(r.checkedAt, zone)}`);
    if (r.verifiedElsewhere) lines.push('!! VERIFIED UNDER ANOTHER ACCOUNT');
  }
  lines.push('');
  if (access) {
    lines.push(`INVITE   ${access.githubUsername}`, ...label('RIGHTS', access.permission), ...wrap(access.instructions, cols));
  }
  lines.push(`.zoria   ${username ?? '-'}`, 'keep the repository private');
  return lines;
}

export function rollLines(entries: RollEntry[], displayName: string | null, zone: string): string[] {
  if (entries.length === 0) return ['THE ROLL IS EMPTY'];
  const width = String(Math.max(...entries.map((e) => e.n))).length + 1;
  return entries.map((e) =>
    `${String(e.n).padStart(width)} ${short(e.at, zone)} +${e.sinceOpen}s ${e.name}${e.name === displayName ? ' ◄' : ''}`);
}
