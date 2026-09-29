import type { Hex } from '@zoria/protocol';
import { dist, keyOf } from '../hex.ts';
import type { Cell } from '../hex.ts';
import { cfg } from './valley.ts';
import type { Valley } from './valley.ts';

export interface LinkOracle {
  linkOk(a: Hex, b: Hex): boolean;
}

export class Links {
  private readonly oracle: LinkOracle;
  private readonly range: number;
  private readonly memo = new Map<string, boolean>();

  constructor(oracle: LinkOracle, v: Valley) {
    this.oracle = oracle;
    this.range = cfg(v, 'linkRange') + 1;
  }

  ok(a: Cell, b: Cell): boolean {
    if (dist(a, b) > this.range) return false;
    const ka = keyOf(a);
    const kb = keyOf(b);
    const k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
    const hit = this.memo.get(k);
    if (hit !== undefined) return hit;
    const res = this.oracle.linkOk(a, b);
    this.memo.set(k, res);
    return res;
  }

  reach(site: Cell, anchors: Cell[]): boolean {
    return anchors.some((a) => this.ok(a, site));
  }
}
