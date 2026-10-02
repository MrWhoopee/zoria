import type { ArenaFrame } from './frame.ts';
import type { ArenaRecord } from './record.ts';
import { Session } from './session.ts';

export interface Replay {
  final: ArenaFrame;
  scores: [number, number, number][];
  frames: Map<number, ArenaFrame>;
}

export function replay(r: ArenaRecord, withCommands: boolean, keep: Set<number> = new Set()): Replay {
  const s = new Session({ seed: r.seed, slot: r.slot, rivals: r.rivals, preset: r.preset });
  const queue = withCommands ? [...r.commands] : [];
  const scores: [number, number, number][] = [];
  const frames = new Map<number, ArenaFrame>();
  let final: ArenaFrame | null = null;
  for (let t = 0; !s.done(); t++) {
    while (queue.length > 0 && (queue[0]?.t ?? Infinity) <= t) {
      const next = queue.shift();
      if (next) s.command(next.c);
    }
    const f = s.step();
    if (!f) break;
    final = f;
    scores.push(f.score);
    if (keep.has(f.t)) frames.set(f.t, f);
  }
  if (!final) throw new Error('replay produced no frames');
  return { final, scores, frames };
}
