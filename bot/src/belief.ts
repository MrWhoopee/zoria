import type { Observe } from '@zoria/protocol';
import type { BeliefFrame } from '@zoria/sdk';
import type { World } from './world.ts';

export function beliefFrame(w: World, obs: Observe | null): BeliefFrame {
  const own: Record<string, string | null> = {};
  const dark: Record<string, boolean> = {};
  for (const [k, o] of w.owner) {
    own[k] = o;
    if (w.dark.get(k) === true) dark[k] = true;
  }
  return {
    t: w.t,
    full: true,
    pulse: { energy: w.energy, chan: w.chan, ear: w.ear, minutes: w.minutes, needles: w.mine.length },
    own,
    dark,
    foe: (obs?.foe ?? []).map((f) => [f.id, f.p, f.q, f.r]),
    noisy: obs?.noisy.length ?? 0,
    units: w.units.map((u) => [u.id, u.q, u.r, u.task?.path ?? 0]),
  };
}
