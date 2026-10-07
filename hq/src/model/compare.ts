import { fmtScore } from '../anchors.ts';
import { focusSlot } from './names.ts';
import type { Breakdown, PackSummary } from './names.ts';

const ITEMS = ['network', 'orders', 'stolen', 'pactTax'] as const;

export interface Comparison {
  winner: string;
  diff(match: number): string;
  top(match: number): string;
}

function inMatch(p: PackSummary, match: number): Breakdown | undefined {
  return p.matches[match - 1]?.breakdown[focusSlot(p, match)];
}

export function compare(a: PackSummary, b: PackSummary, ids: [string, string] = ['preset-a', 'preset-b']): Comparison {
  const seatA = a.belief?.seat ?? 0;
  const seatB = b.belief?.seat ?? 0;
  const netA = a.breakdown[seatA]?.network ?? 0;
  const netB = b.breakdown[seatB]?.network ?? 0;
  return {
    winner: netB > netA ? ids[1] : ids[0],
    diff: (match) => fmtScore(Math.abs((inMatch(a, match)?.total ?? 0) - (inMatch(b, match)?.total ?? 0))),
    top: (match) => {
      const x = inMatch(a, match);
      const y = inMatch(b, match);
      let best: string = ITEMS[0];
      let gap = -1;
      for (const k of ITEMS) {
        const d = Math.abs((x?.[k] ?? 0) - (y?.[k] ?? 0));
        if (d > gap) {
          gap = d;
          best = k;
        }
      }
      return best;
    },
  };
}
