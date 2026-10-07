export const ANCHORS = ['tick', 'match', 'mode', 'focus', 'cell', 'cell-owner-truth', 'cell-owner-belief', 'ghost-cell', 'ghost-age', 'diff-count', 'dark-count', 'score', 'needles', 'shares', 'bytes', 'orders', 'denied', 'deny-word', 'deny-top-tick', 'ab-winner', 'ab-diff', 'ab-top', 'promote-status', 'live-lag', 'live-state'] as const;

export const ORGANS = ['go-tick', 'go-match', 'go-mode', 'go-focus', 'go-cell', 'go-unit', 'go-order', 'go-pack', 'go-preset', 'do-promote'] as const;

export type Anchor = (typeof ANCHORS)[number];

export interface Cell {
  q: number;
  r: number;
}

export function fmtScore(x: number): string {
  const s = (Math.round(x * 10) / 10).toFixed(1);
  return s === '-0.0' ? '0.0' : s;
}

export function fmtCell(c: Cell): string {
  return c.q + ',' + c.r;
}

export function fmtShares(s: readonly number[]): string {
  return s.join(',');
}

export function parseCell(text: string): Cell | null {
  const m = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/.exec(text);
  if (!m) return null;
  return { q: Number(m[1]), r: Number(m[2]) };
}
