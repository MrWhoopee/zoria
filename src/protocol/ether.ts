import type { Phase } from './types.ts';
import type { Observation } from './classify.ts';

export type Mark = 'signal' | 'noise' | 'forgery' | 'silence' | 'jam';

export type Letter = { of: number | null; fragments: Record<number, string> };

const RIBBON_MAX = 240;

export type EtherState = {
  phase: Phase | null;
  lastFrameAt: number | null;
  skewMs: number;
  opensAt: number | null;
  closesAt: number | null;
  onAir: number;
  fragments: Record<number, string>;
  fragmentsOf: number | null;
  archive: Letter[];
  silentUntil: number;
  silentWhy: 'jam' | 'stop' | null;
  ribbon: Mark[];
};

export function initialEther(): EtherState {
  return {
    phase: null, lastFrameAt: null, skewMs: 0,
    opensAt: null, closesAt: null, onAir: 0,
    fragments: {}, fragmentsOf: null, archive: [],
    silentUntil: 0, silentWhy: null, ribbon: [],
  };
}

function push(ribbon: Mark[], mark: Mark): Mark[] {
  const next = ribbon.length >= RIBBON_MAX ? ribbon.slice(1) : ribbon.slice();
  next.push(mark);
  return next;
}

export function reduceEther(s: EtherState, o: Observation): EtherState {
  if (o.t === 'jammed' || o.t === 'stopping') {
    const end = o.receivedAt + o.retryAfterMs;
    const why = o.t === 'jammed' ? 'jam' : 'stop';
    return {
      ...s,
      silentUntil: Math.max(s.silentUntil, end),
      silentWhy: end >= s.silentUntil ? why : s.silentWhy,
      ribbon: push(s.ribbon, o.t === 'jammed' ? 'jam' : 'silence'),
    };
  }
  if (o.t === 'silence') {
    return { ...s, ribbon: push(s.ribbon, 'silence') };
  }
  if (o.t === 'noise') {
    return { ...s, ribbon: push(s.ribbon, o.why === 'bad-seal' ? 'forgery' : 'noise') };
  }

  const ribbon = push(s.ribbon, 'signal');
  if (s.lastFrameAt !== null && o.frameAt <= s.lastFrameAt) {
    return { ...s, ribbon };
  }

  const f = o.frame;
  const newLetter = f.fragment !== null && s.fragmentsOf !== null && f.fragment.of !== s.fragmentsOf;
  const archive = newLetter ? [...s.archive, { of: s.fragmentsOf, fragments: s.fragments }] : s.archive;
  const fragments = newLetter ? {} : { ...s.fragments };
  if (f.fragment && fragments[f.fragment.n] === undefined) {
    fragments[f.fragment.n] = f.fragment.text;
  }

  let opensAt = s.opensAt;
  let closesAt = s.closesAt;
  if (f.window) {
    opensAt = Date.parse(f.window.opensAt);
    closesAt = Date.parse(f.window.closesAt);
  } else if (f.harbinger) {
    opensAt = o.frameAt + f.harbinger.opensIn * 1000;
  }

  return {
    ...s,
    phase: f.phase,
    lastFrameAt: o.frameAt,
    skewMs: o.frameAt - o.receivedAt,
    opensAt,
    closesAt,
    onAir: f.onAir,
    fragments,
    fragmentsOf: f.fragment ? f.fragment.of : s.fragmentsOf,
    archive,
    ribbon,
  };
}

export function serverNow(s: EtherState, localNow: number): number {
  return localNow + s.skewMs;
}

export function msUntilOpen(s: EtherState, localNow: number): number | null {
  if (s.opensAt === null) return null;
  return s.opensAt - serverNow(s, localNow);
}
