import test from 'node:test';
import assert from 'node:assert/strict';
import { blockRows, notebookPages, PAGE_COLS, PAGE_ROWS, type Page } from '../../src/client/notebook/pages.ts';
import { parseMarkdown } from '../../src/client/text/markdown.ts';
import type { Stage, StageSummary } from '../../src/agent/account.ts';

const summary = (id: string, position: number): StageSummary =>
  ({ id, position, title: `Part ${position}`, excerpt: '', publishedAt: null, releasedAt: '2026-09-28T07:00:00.000Z', acknowledgedAt: null, errataAt: null });
const full = (s: StageSummary, body: string, errata: string | null = null): Stage => {
  const { excerpt: _e, ...rest } = s;
  return { ...rest, body, errata };
};

const rowsOf = (p: Page): number => (p.kind === 'stage' ? p.blocks.reduce((n, b) => n + blockRows(b), 0) : 0);

test('with nothing released the notebook is a contents page and a blank', () => {
  const pages = notebookPages([], new Map());
  assert.deepEqual(pages.map((p) => p.kind), ['contents', 'blank']);
});

test('the contents page points at the page where each part starts', () => {
  const s = summary('a', 2);
  const pages = notebookPages([s], new Map([['a', full(s, 'Hello')]]));
  const contents = pages[0];
  assert.equal(contents.kind, 'contents');
  if (contents.kind === 'contents') assert.equal(contents.entries[0].page, 1);
  assert.equal(pages[1].kind, 'stage');
  assert.equal(pages.length % 2, 0);
});

test('a part whose text has not arrived yet shows a waiting page', () => {
  const pages = notebookPages([summary('a', 2)], new Map());
  assert.equal(pages[1].kind, 'waiting');
});

test('errata sit on the first page of the part, apart from the text', () => {
  const s = summary('a', 2);
  const pages = notebookPages([s], new Map([['a', full(s, 'Body', 'Fix line 3')]]));
  const first = pages[1];
  assert.ok(first.kind === 'stage' && first.first && first.errata === 'Fix line 3');
  const later = pages.slice(2).filter((p) => p.kind === 'stage');
  assert.ok(later.every((p) => p.kind === 'stage' && p.errata === null));
});

test('no page is taller than the page', () => {
  const s = summary('a', 2);
  const body = Array.from({ length: 60 }, (_, i) => `## Section ${i}\n\n${'word '.repeat(90)}\n\n- one\n- two\n\n\`\`\`\n${'code\n'.repeat(8)}\`\`\``).join('\n\n');
  const pages = notebookPages([s], new Map([['a', full(s, body)]]));
  for (const p of pages) assert.ok(rowsOf(p) <= PAGE_ROWS, `${rowsOf(p)} rows`);
  assert.ok(pages.length > 10);
});

test('a paragraph taller than a page is cut, a code block is cut by lines', () => {
  const s = summary('a', 2);
  const giant = 'w '.repeat(PAGE_COLS * PAGE_ROWS);
  const code = '```\n' + 'x\n'.repeat(PAGE_ROWS * 2) + '```';
  const pages = notebookPages([s], new Map([['a', full(s, `${giant}\n\n${code}`)]]));
  for (const p of pages) assert.ok(rowsOf(p) <= PAGE_ROWS);
});

test('block heights follow the typewriter grid', () => {
  const [h, p, l, c] = parseMarkdown('# Title\n\nshort\n\n- a\n- b\n\n```\n1\n2\n```');
  assert.equal(blockRows(h), 2);
  assert.equal(blockRows(p), 2);
  assert.equal(blockRows(l), 3);
  assert.equal(blockRows(c), 4);
});
