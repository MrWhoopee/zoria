import { parseMarkdown, plainText, type Block } from '../text/markdown.ts';
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

export function blockRows(b: Block, cols = PAGE_COLS): number {
  if (b.t === 'heading' || b.t === 'para') return lines(plainText(b.inline, false), cols) + 1;
  if (b.t === 'list') return b.items.reduce((n, item) => n + lines(plainText(item, false), cols - LIST_INDENT), 0) + 1;
  return b.lines.length + 2;
}

function headerRows(title: string, errata: string | null, cols: number): number {
  return lines(title, cols) + 1 + STAMP_ROWS + (errata ? lines(errata, cols - 2) + 3 : 0);
}

function split(b: Block, room: number, cols: number): [Block, Block] | null {
  if (b.t === 'para') {
    const all = wrap(plainText(b.inline, false), cols);
    const take = room - 1;
    if (take < 1 || take >= all.length) return null;
    return [
      { t: 'para', inline: [{ t: 'text', s: all.slice(0, take).join(' ') }] },
      { t: 'para', inline: [{ t: 'text', s: all.slice(take).join(' ') }] },
    ];
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
    const take = room - 2;
    if (take < 1 || take >= b.lines.length) return null;
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
