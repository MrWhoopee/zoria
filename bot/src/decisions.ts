import type { Order } from '@zoria/protocol';

export interface Choice {
  tag: string;
  unit: string | null;
  value: number;
  order: Order;
}

export interface DecisionRecord {
  t: number;
  offered: number;
  errors: number;
  chosen: Choice[];
}

export function decisionLine(d: DecisionRecord): string {
  return JSON.stringify(d) + '\n';
}
