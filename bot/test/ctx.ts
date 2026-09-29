import { createEngine } from '@zoria/engine';
import { RulesOracle } from '@zoria/sdk';
import type { Observe, SlotName } from '@zoria/protocol';
import { Links } from '../src/map/links.ts';
import { newMemo } from '../src/plans/types.ts';
import type { Ctx } from '../src/plans/types.ts';
import { World } from '../src/world.ts';
import { manifestBytes, valleyOf } from './fixture.ts';

const oracles = new Map<number, RulesOracle>();

export function ctxOf(slot: SlotName, obs: Observe, seed = 2026): Ctx {
  const v = valleyOf(slot, seed);
  let o = oracles.get(seed);
  if (!o) {
    o = new RulesOracle(createEngine, manifestBytes(seed));
    oracles.set(seed, o);
  }
  const w = new World(v);
  w.update(obs);
  return { v, w, links: new Links(o, v), memo: newMemo() };
}
