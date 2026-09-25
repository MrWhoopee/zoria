import { COLS } from './grid.ts';

export type Scroll = { title: string; lines: string[]; top: number };

export const PAGE_ROWS = 9;

const maxTop = (s: Scroll, rows: number): number => Math.max(0, s.lines.length - rows);

export function openScroll(title: string, lines: string[]): Scroll {
  return { title, lines, top: 0 };
}

export function scrollBy(s: Scroll, delta: number, rows = PAGE_ROWS): Scroll {
  const top = Math.min(maxTop(s, rows), Math.max(0, s.top + delta));
  return top === s.top ? s : { ...s, top };
}

export function scrollTo(s: Scroll, where: 'start' | 'end', rows = PAGE_ROWS): Scroll {
  return scrollBy(s, where === 'start' ? -s.top : maxTop(s, rows) - s.top, rows);
}

export function scrollView(s: Scroll, rows = PAGE_ROWS, cols = COLS): string[] {
  const max = maxTop(s, rows);
  const where = max === 0 ? '' : s.top === 0 ? '▼ TOP' : s.top >= max ? '▲ END' : `▼ ${Math.round((s.top / max) * 100)}%`;
  const room = Math.max(0, cols - Array.from(where).length - 1);
  const title = Array.from(s.title).slice(0, room).join('');
  const pad = ' '.repeat(Math.max(1, cols - Array.from(title).length - Array.from(where).length));
  return [where ? `${title}${pad}${where}` : title, ...s.lines.slice(s.top, s.top + rows)];
}

export function scrollKey(key: string): number | 'start' | 'end' | null {
  if (key === 'ArrowDown') return 1;
  if (key === 'ArrowUp') return -1;
  if (key === 'PageDown') return PAGE_ROWS;
  if (key === 'PageUp') return -PAGE_ROWS;
  if (key === 'Home') return 'start';
  if (key === 'End') return 'end';
  return null;
}
