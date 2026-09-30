import { createEngine } from '@zoria/engine';
import { RulesOracle } from '@zoria/sdk';
import type { BeliefFrame, WireBot } from '@zoria/sdk';
import { decodeManifest, decodeObserve, decodeVerdicts, encodeOrders } from '@zoria/protocol';
import type { Observe, SlotName } from '@zoria/protocol';
import { beliefFrame } from './belief.ts';
import { Brain } from './brain.ts';
import type { BrainStats } from './brain.ts';
import type { DecisionRecord } from './decisions.ts';
import { Links } from './map/links.ts';
import { buildValley } from './map/valley.ts';
import { PRESETS, presetOf } from './preset.ts';
import type { Preset } from './preset.ts';

export interface Strategy extends WireBot {
  belief(obs: Observe | null): BeliefFrame | null;
  stats(): BrainStats | null;
  decisions(): DecisionRecord | null;
}

class BrainStrategy implements Strategy {
  private brain: Brain | null = null;
  private readonly preset: Preset;

  constructor(preset: Preset) {
    this.preset = preset;
  }

  init(manifest: Uint8Array, slot: SlotName): void {
    const m = decodeManifest(manifest);
    if (!m) throw new Error('manifest did not decode');
    const v = buildValley(m, slot);
    this.brain = new Brain(v, new Links(new RulesOracle(createEngine, manifest), v), undefined, undefined, this.preset);
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

  decisions(): DecisionRecord | null {
    return this.brain && this.brain.world.t > 0 ? this.brain.decisions() : null;
  }
}

export function presets(): string[] {
  return Object.keys(PRESETS);
}

export function createStrategy(preset = 'основний'): Strategy {
  return new BrainStrategy(presetOf(preset));
}
