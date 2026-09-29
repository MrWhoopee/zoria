import { createEngine } from '@zoria/engine';
import { BlankBot, runMatch } from '@zoria/sdk';
import { decodeManifest, encodeManifest } from '@zoria/protocol';
import type { Manifest, SlotName } from '@zoria/protocol';
import { buildValley } from '../src/map/valley.ts';
import type { Valley } from '../src/map/valley.ts';

class Catcher extends BlankBot {
  bytes: Uint8Array | null = null;
  override init(b: Uint8Array, s: SlotName): void {
    this.bytes = b;
    super.init(b, s);
  }
}

const cache = new Map<number, Uint8Array>();

export function manifestBytes(seed = 2026): Uint8Array {
  const hit = cache.get(seed);
  if (hit) return hit;
  const c = new Catcher();
  runMatch(createEngine, { seed, ticks: 2, bots: { A: c } });
  if (!c.bytes) throw new Error('no manifest');
  const m = decodeManifest(c.bytes);
  if (!m) throw new Error('bad manifest');
  m.ticks = 1200;
  m.dawn = { at: 1000, ring: m.dawn.ring };
  const out = encodeManifest(m);
  cache.set(seed, out);
  return out;
}

export function manifestOf(seed = 2026): Manifest {
  const m = decodeManifest(manifestBytes(seed));
  if (!m) throw new Error('bad manifest');
  return m;
}

export function valleyOf(slot: SlotName, seed = 2026): Valley {
  return buildValley(manifestOf(seed), slot);
}
