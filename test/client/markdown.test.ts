import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownLines, parseInline, parseMarkdown, plainText, safeHref } from '../../src/client/text/markdown.ts';

test('only http and https links survive', () => {
  assert.equal(safeHref('https://zoria.net/spec/'), 'https://zoria.net/spec/');
  assert.equal(safeHref('http://x.org'), 'http://x.org/');
  for (const bad of ['javascript:alert(1)', 'data:text/html,<b>', 'JaVaScRiPt:alert(1)', 'vbscript:x', '//evil.com', 'nonsense']) {
    assert.equal(safeHref(bad), null, bad);
  }
});

test('inline bold, code and links; unclosed marks stay literal', () => {
  assert.deepEqual(parseInline('a **b** `c` [d](https://e.org)'), [
    { t: 'text', s: 'a ' }, { t: 'bold', s: 'b' }, { t: 'text', s: ' ' }, { t: 'code', s: 'c' },
    { t: 'text', s: ' ' }, { t: 'link', s: 'd', href: 'https://e.org/' },
  ]);
  assert.deepEqual(parseInline('**open `tick [x](y'), [{ t: 'text', s: '**open `tick [x](y' }]);
  assert.deepEqual(parseInline('[click](javascript:alert(1))'), [{ t: 'link', s: 'click', href: null }, { t: 'text', s: ')' }]);
});

test('HTML is plain text, never markup', () => {
  const blocks = parseMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
  assert.deepEqual(blocks.map((b) => b.t), ['para', 'para']);
  assert.equal(plainText((blocks[0] as { inline: Parameters<typeof plainText>[0] }).inline, false), '<script>alert(1)</script>');
});

test('headings one to four, deeper ones are text', () => {
  const b = parseMarkdown('# One\n#### Four\n##### Five');
  assert.equal(b[0].t, 'heading');
  assert.equal((b[1] as { level: number }).level, 4);
  assert.equal(b[2].t, 'para');
});

test('lists: bullets, numbers, continuation lines; a type change starts a new list', () => {
  const b = parseMarkdown('- a\n  more\n* b\n1. c\n2. d');
  assert.equal(b.length, 2);
  assert.deepEqual(b.map((x) => x.t), ['list', 'list']);
  const first = b[0] as { ordered: boolean; items: Parameters<typeof plainText>[0][] };
  assert.equal(first.ordered, false);
  assert.equal(plainText(first.items[0], false), 'a more');
  assert.equal((b[1] as { ordered: boolean }).ordered, true);
});

test('fenced code keeps its lines verbatim, an unclosed fence runs to the end', () => {
  const b = parseMarkdown('```ts\nconst a = 1;\n  **not bold**\n```\nafter\n```\nopen');
  assert.deepEqual(b[0], { t: 'code', lines: ['const a = 1;', '  **not bold**'] });
  assert.equal(b[1].t, 'para');
  assert.deepEqual(b[2], { t: 'code', lines: ['open'] });
});

test('windows line ends are handled', () => {
  assert.equal(parseMarkdown('# A\r\n\r\ntext').length, 2);
});

test('terminal lines: upper-case headings, bullets with hanging indent, links spelled out, code cut not wrapped', () => {
  const lines = markdownLines(parseMarkdown('# Title\n\n- one two three four\n\n[site](https://zoria.net)\n\n```\n' + 'x'.repeat(30) + '\n```'), 20);
  assert.equal(lines[0], 'TITLE');
  assert.ok(lines.includes('• one two three four'.slice(0, 20)) || lines.some((l) => l.startsWith('• one')));
  assert.ok(lines.some((l) => l.includes('<https://zoria.net/>')));
  assert.ok(lines.every((l) => Array.from(l).length <= 20));
  assert.ok(lines.includes('  ' + 'x'.repeat(18)));
});

test('a 64 000 character line parses quickly', () => {
  const started = performance.now();
  const b = parseMarkdown('**'.repeat(10) + 'a'.repeat(64_000));
  assert.equal(b.length, 1);
  assert.ok(performance.now() - started < 500);
});

test('a 64 000 character line of brackets parses quickly', () => {
  const started = performance.now();
  parseMarkdown('['.repeat(64_000));
  parseMarkdown('[a'.repeat(32_000));
  assert.ok(performance.now() - started < 300, `${Math.round(performance.now() - started)} ms`);
});
