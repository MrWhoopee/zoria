import { wrap } from './wrap.ts';

export type Inline =
  | { t: 'text' | 'bold' | 'code'; s: string }
  | { t: 'link'; s: string; href: string | null };

export type Block =
  | { t: 'heading'; level: number; inline: Inline[] }
  | { t: 'para'; inline: Inline[] }
  | { t: 'list'; ordered: boolean; items: Inline[][] }
  | { t: 'code'; lines: string[] };

const HEADING = /^(#{1,4})\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+\.\s+(.*)$/;
const FENCE = /^\s*```/;
const LINK = /\[([^[\]\n]{1,1000})\]\(([^)\s]{1,2048})\)/y;

export function safeHref(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = (): void => {
    if (text !== '') out.push({ t: 'text', s: text });
    text = '';
  };
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('**', i)) {
      const end = src.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: 'bold', s: src.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    if (src[i] === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ t: 'code', s: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (src[i] === '[') {
      LINK.lastIndex = i;
      const m = LINK.exec(src);
      if (m) {
        flush();
        out.push({ t: 'link', s: m[1], href: safeHref(m[2]) });
        i += m[0].length;
        continue;
      }
    }
    text += src[i];
    i += 1;
  }
  flush();
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const endPara = (): void => {
    if (para.length > 0) blocks.push({ t: 'para', inline: parseInline(para.join(' ')) });
    para = [];
  };
  const endList = (): void => {
    if (list) blocks.push({ t: 'list', ordered: list.ordered, items: list.items.map(parseInline) });
    list = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (FENCE.test(line)) {
      endPara();
      endList();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      blocks.push({ t: 'code', lines: code });
      continue;
    }
    if (line.trim() === '') {
      endPara();
      endList();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      endPara();
      endList();
      blocks.push({ t: 'heading', level: heading[1].length, inline: parseInline(heading[2].trim()) });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      endPara();
      const ordered = numbered !== null;
      if (list && list.ordered !== ordered) endList();
      list ??= { ordered, items: [] };
      list.items.push(item[1].trim());
      continue;
    }
    if (list && /^\s+\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    endList();
    para.push(line.trim());
  }
  endPara();
  endList();
  return blocks;
}

export function plainText(inline: Inline[], withLinks: boolean): string {
  return inline
    .map((x) => (x.t === 'link' && withLinks && x.href !== null ? `${x.s} <${x.href}>` : x.s))
    .join('');
}

function cut(text: string, cols: number): string[] {
  const chars = Array.from(text);
  if (chars.length === 0) return [''];
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += cols) out.push(chars.slice(i, i + cols).join(''));
  return out;
}

export function markdownLines(blocks: Block[], cols: number): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (out.length > 0) out.push('');
    if (b.t === 'heading') out.push(...wrap(plainText(b.inline, true).toUpperCase(), cols));
    else if (b.t === 'para') out.push(...wrap(plainText(b.inline, true), cols));
    else if (b.t === 'list') {
      b.items.forEach((item, k) => {
        const mark = b.ordered ? `${k + 1}. ` : '• ';
        const body = wrap(plainText(item, true), cols - mark.length);
        out.push(...body.map((l, j) => (j === 0 ? mark : ' '.repeat(mark.length)) + l));
      });
    } else {
      for (const l of b.lines) out.push(...cut(`  ${l}`, cols));
    }
  }
  return out;
}
