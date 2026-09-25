import { COLS } from './grid.ts';
import { wrap } from '../text/wrap.ts';
import type { Letter } from '../../protocol/ether.ts';

export type LetterSource = { fragments: Record<number, string>; fragmentsOf: number | null; archive: Letter[] };

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

export function letterLines(letter: LetterSource, cols = COLS): string[] {
  if (letter.fragmentsOf === null) return ['NONE YET', 'fragments arrive with genuine frames'];
  const lines = fragmentBlocks(letter.fragments, letter.fragmentsOf, cols).flat();
  if (letter.archive.length > 0) lines.push('', `EARLIER LETTERS KEPT: ${letter.archive.length}`);
  return lines;
}
