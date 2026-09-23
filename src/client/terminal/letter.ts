import { COLS } from './grid.ts';
import type { Letter } from '../../protocol/ether.ts';

export type LetterSource = { fragments: Record<number, string>; fragmentsOf: number | null; archive: Letter[] };

const PAGE_SIZE = 8;

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

function fragmentBlocks(fragments: Record<number, string>, of: number, cols: number): string[][] {
  const width = Math.max(2, String(of).length);
  const indent = ' '.repeat(width + 1);
  const blocks: string[][] = [];
  for (let n = 1; n <= of; n += 1) {
    const label = String(n).padStart(width, '0');
    const text = fragments[n];
    if (text === undefined) {
      blocks.push([`${label} ...`]);
      continue;
    }
    blocks.push(wrap(text, cols - indent.length).map((l, i) => (i === 0 ? `${label} ${l}` : `${indent}${l}`)));
  }
  return blocks;
}

function paginate(blocks: string[][], size: number): string[][] {
  const pages: string[][] = [[]];
  for (const block of blocks) {
    const page = pages[pages.length - 1];
    if (page.length > 0 && page.length + block.length > size) pages.push([...block.slice(0, size)]);
    else page.push(...block.slice(0, size - page.length));
  }
  return pages;
}

export function letterScreen(letter: LetterSource, page: number, cols = COLS): string[] {
  if (letter.fragmentsOf === null) {
    return ['LETTER   NONE YET', 'fragments arrive with genuine frames'];
  }
  const pageList = paginate(fragmentBlocks(letter.fragments, letter.fragmentsOf, cols), PAGE_SIZE);
  const pages = pageList.length;
  const current = Math.min(Math.max(1, page), pages);
  const have = Object.keys(letter.fragments).length;
  const screen = [`LETTER   ${have}/${letter.fragmentsOf}   PAGE ${current}/${pages}`, ...pageList[current - 1]];
  if (current < pages) screen.push(`type LETTER ${current + 1}`);
  else if (letter.archive.length > 0) screen.push(`EARLIER LETTERS KEPT: ${letter.archive.length}`);
  return screen;
}
