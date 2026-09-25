import { parseMarkdown, plainText, type Block, type Inline } from '../text/markdown.ts';
import { wrap } from '../text/wrap.ts';
import type { Stage, StageSummary } from '../../agent/account.ts';

export const PAGE_COLS = 50;
export const PAGE_ROWS = 28;
const STAMP_ROWS = 2;
const LIST_INDENT = 3;

export type ContentsEntry = {
  id: string;
  position: number;
  title: string;
  releasedAt: string | null;
  acknowledgedAt: string | null;
  errataAt: string | null;
  page: number | null;
};

export type Page =
  | { kind: 'contents'; entries: ContentsEntry[] }
  | { kind: 'stage'; stageId: string; position: number; title: string; first: boolean; errata: string | null; acknowledgedAt: string | null; blocks: Block[] }
  | { kind: 'waiting'; position: number; title: string }
  | { kind: 'blank' };

const lines = (text: string, cols: number): number => wrap(text, cols).length;
const codeRows = (line: string, cols: number): number => Math.max(1, Math.ceil(Array.from(line).length / cols));

export function blockRows(b: Block, cols = PAGE_COLS): number {
  if (b.t === 'heading' || b.t === 'para') return lines(plainText(b.inline, false), cols) + 1;
  if (b.t === 'list') return b.items.reduce((n, item) => n + lines(plainText(item, false), cols - LIST_INDENT), 0) + 1;
  return b.lines.reduce((n, l) => n + codeRows(l, cols), 0) + 1;
}

function headerRows(title: string, errata: string | null, cols: number): number {
  return lines(title, cols) + 1 + STAMP_ROWS + (errata ? lines(errata, cols - 2) + 3 : 0);
}

function paragraphCut(inline: Inline[], take: number, cols: number): number | null {
  const plain = plainText(inline, false);
  if (take < 1 || wrap(plain, cols).length <= take) return null;
  const links: Array<[number, number]> = [];
  let pos = 0;
  for (const x of inline) {
    if (x.t === 'link') links.push([pos, pos + x.s.length]);
    pos += x.s.length;
  }
  const ends = [...plain.matchAll(/\S+/g)].map((m) => (m.index ?? 0) + m[0].length);
  let lo = 0;
  let hi = ends.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (wrap(plain.slice(0, ends[mid - 1]), cols).length <= take) lo = mid;
    else hi = mid - 1;
  }
  const insideLink = (at: number): boolean => links.some(([a, b]) => a < at && at < b);
  while (lo > 0 && insideLink(ends[lo - 1])) lo -= 1;
  if (lo > 0) return ends[lo - 1];
  const hard = take * cols;
  return hard < plain.length && !insideLink(hard) ? hard : null;
}

function cutInline(inline: Inline[], at: number): [Inline[], Inline[]] {
  const left: Inline[] = [];
  const right: Inline[] = [];
  let pos = 0;
  for (const x of inline) {
    const end = pos + x.s.length;
    if (end <= at) left.push(x);
    else if (pos >= at) right.push(x);
    else {
      left.push({ ...x, s: x.s.slice(0, at - pos) });
      right.push({ ...x, s: x.s.slice(at - pos) });
    }
    pos = end;
  }
  while (right.length > 0 && right[0].s.trimStart() === '') right.shift();
  if (right.length > 0) right[0] = { ...right[0], s: right[0].s.trimStart() };
  return [left, right];
}

function split(b: Block, room: number, cols: number): [Block, Block] | null {
  if (b.t === 'para') {
    const at = paragraphCut(b.inline, room - 1, cols);
    if (at === null) return null;
    const [left, right] = cutInline(b.inline, at);
    return [{ t: 'para', inline: left }, { t: 'para', inline: right }];
  }
  if (b.t === 'list') {
    let used = 1;
    let k = 0;
    while (k < b.items.length && used + lines(plainText(b.items[k], false), cols - LIST_INDENT) <= room) {
      used += lines(plainText(b.items[k], false), cols - LIST_INDENT);
      k += 1;
    }
    if (k === 0 || k === b.items.length) return null;
    return [{ ...b, items: b.items.slice(0, k) }, { ...b, items: b.items.slice(k) }];
  }
  if (b.t === 'code') {
    let used = 1;
    let take = 0;
    while (take < b.lines.length && used + codeRows(b.lines[take], cols) <= room) {
      used += codeRows(b.lines[take], cols);
      take += 1;
    }
    if (take === 0 || take === b.lines.length) return null;
    return [{ t: 'code', lines: b.lines.slice(0, take) }, { t: 'code', lines: b.lines.slice(take) }];
  }
  return null;
}

function stagePages(stage: Stage, cols: number, rows: number): Page[] {
  const pages: Page[] = [];
  const queue = parseMarkdown(stage.body);
  let blocks: Block[] = [];
  let free = rows - headerRows(stage.title, stage.errata, cols);
  const flush = (): void => {
    pages.push({
      kind: 'stage', stageId: stage.id, position: stage.position, title: stage.title,
      first: pages.length === 0, errata: pages.length === 0 ? stage.errata : null,
      acknowledgedAt: stage.acknowledgedAt, blocks,
    });
    blocks = [];
    free = rows;
  };
  while (queue.length > 0) {
    const b = queue.shift() as Block;
    const need = blockRows(b, cols);
    if (need <= free) {
      blocks.push(b);
      free -= need;
      continue;
    }
    const parts = split(b, free, cols);
    if (parts) {
      blocks.push(parts[0]);
      queue.unshift(parts[1]);
      flush();
      continue;
    }
    if (blocks.length > 0 || free < rows) {
      queue.unshift(b);
      flush();
      continue;
    }
    const forced = split(b, rows, cols);
    if (forced) {
      blocks.push(forced[0]);
      queue.unshift(forced[1]);
    } else {
      blocks.push(b);
    }
    flush();
  }
  if (blocks.length > 0 || pages.length === 0) flush();
  return pages;
}

export function notebookPages(
  stages: StageSummary[], texts: ReadonlyMap<string, Stage>, cols = PAGE_COLS, rows = PAGE_ROWS,
): Page[] {
  const entries: ContentsEntry[] = [];
  const body: Page[] = [];
  for (const s of [...stages].sort((a, b) => a.position - b.position)) {
    const text = texts.get(s.id);
    entries.push({
      id: s.id, position: s.position, title: s.title, releasedAt: s.releasedAt,
      acknowledgedAt: text?.acknowledgedAt ?? s.acknowledgedAt, errataAt: s.errataAt, page: 1 + body.length,
    });
    if (text) body.push(...stagePages(text, cols, rows));
    else body.push({ kind: 'waiting', position: s.position, title: s.title });
  }
  const pages: Page[] = [{ kind: 'contents', entries }, ...body];
  if (pages.length % 2 === 1) pages.push({ kind: 'blank' });
  return pages;
}
