export const COLS = 54;
export const ROWS = 20;

export type ScreenParts = {
  header: string[];
  body: string[];
  input: string;
  hint: string;
};

export type Screen = { lines: string[]; cursor: { row: number; col: number } };

const PROMPT = '> ';

export function fit(text: string, cols: number): string {
  const chars = Array.from(text);
  if (chars.length >= cols) return chars.slice(0, cols).join('');
  return text + ' '.repeat(cols - chars.length);
}

export function composeScreen(parts: ScreenParts, cols = COLS, rows = ROWS): Screen {
  const top = parts.header.slice(0, rows - 2);
  const bodyRoom = rows - 2 - top.length;
  const body = bodyRoom > 0 ? parts.body.slice(-bodyRoom) : [];
  const lines = [...top, ...body].map((l) => fit(l, cols));
  while (lines.length < rows - 2) lines.push(' '.repeat(cols));
  const room = cols - PROMPT.length - 1;
  const chars = Array.from(parts.input);
  const visible = chars.length > room ? chars.slice(chars.length - room) : chars;
  lines.push(fit(PROMPT + visible.join(''), cols));
  lines.push(fit(parts.hint, cols));
  return { lines, cursor: { row: rows - 2, col: PROMPT.length + visible.length } };
}

export function splitAtColumn(line: string, col: number): [string, string] {
  const chars = Array.from(line);
  return [chars.slice(0, col).join(''), chars.slice(col + 1).join('')];
}
