export function wrap(text: string, cols: number): string[] {
  const lines: string[] = [];
  let line: string[] = [];
  for (const word of text.split(/\s+/).filter((w) => w !== '')) {
    const chars = Array.from(word);
    if (line.length > 0 && line.length + 1 + chars.length <= cols) {
      line.push(' ', ...chars);
      continue;
    }
    if (line.length > 0) lines.push(line.join(''));
    let at = 0;
    while (chars.length - at > cols) {
      lines.push(chars.slice(at, at + cols).join(''));
      at += cols;
    }
    line = at === 0 ? chars : chars.slice(at);
  }
  lines.push(line.join(''));
  return lines;
}
