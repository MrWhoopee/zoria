export function wrap(text: string, cols: number): string[] {
  const lines: string[] = [];
  let line: string[] = [];
  for (const word of text.split(/\s+/).filter((w) => w !== '')) {
    let chars = Array.from(word);
    if (line.length > 0 && line.length + 1 + chars.length <= cols) {
      line.push(' ', ...chars);
      continue;
    }
    if (line.length > 0) lines.push(line.join(''));
    while (chars.length > cols) {
      lines.push(chars.slice(0, cols).join(''));
      chars = chars.slice(cols);
    }
    line = chars;
  }
  lines.push(line.join(''));
  return lines;
}
