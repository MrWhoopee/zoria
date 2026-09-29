import { createEngine } from '@zoria/engine';
import { RulesOracle } from '@zoria/sdk';
import type { BeliefFrame, WireBot } from '@zoria/sdk';
import { decodeManifest, decodeObserve, decodeVerdicts, encodeOrders } from '@zoria/protocol';
import type { Observe, SlotName } from '@zoria/protocol';
import { beliefFrame } from './belief.ts';
import { Brain } from './brain.ts';
import type { BrainStats } from './brain.ts';
import { Links } from './map/links.ts';
import { buildValley } from './map/valley.ts';

export interface Strategy extends WireBot {
  belief(obs: Observe | null): BeliefFrame | null;
  stats(): BrainStats | null;
}

class BrainStrategy implements Strategy {
  private brain: Brain | null = null;

  init(manifest: Uint8Array, slot: SlotName): void {
    const m = decodeManifest(manifest);
    if (!m) throw new Error('manifest did not decode');
    const v = buildValley(m, slot);
    this.brain = new Brain(v, new Links(new RulesOracle(createEngine, manifest), v));
  }

  tick(observe: Uint8Array): Uint8Array {
    const obs = decodeObserve(observe);
    if (!obs || !this.brain) return encodeOrders([]);
    return encodeOrders(this.brain.tick(obs));
  }

  feedback(verdicts: Uint8Array): void {
    const v = decodeVerdicts(verdicts);
    if (v && this.brain) this.brain.feedback(v);
  }

  belief(obs: Observe | null): BeliefFrame | null {
    return this.brain ? beliefFrame(this.brain.world, obs) : null;
  }

  stats(): BrainStats | null {
    return this.brain ? { ...this.brain.stats } : null;
  }
}

export function presets(): string[] {
  return ['основний'];
}

export function createStrategy(_preset = 'основний'): Strategy {
  return new BrainStrategy();
}
