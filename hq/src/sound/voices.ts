export const SPOOL_TICKS = 30;
export const FLAP_GAP_MS = 90;
export const SPOOL_GAP_MS = 220;
export const KEY_GAP_MS = 40;

export class Gate {
  private last = -Infinity;
  private readonly gap: number;

  constructor(gapMs: number) {
    this.gap = gapMs;
  }

  pass(now: number): boolean {
    if (now - this.last < this.gap) return false;
    this.last = now;
    return true;
  }
}

export type Seek = 'none' | 'tick' | 'spool';

export function seekSound(from: number, to: number): Seek {
  const d = Math.abs(to - from);
  if (d === 0) return 'none';
  return d > SPOOL_TICKS ? 'spool' : 'tick';
}

export function answerSound(status: string): 'bell' | 'buzz' | null {
  if (status === '200') return 'bell';
  if (status === '' || status === '-' || status === '…') return null;
  return 'buzz';
}

export function flapBursts(changed: number): number {
  return Math.max(0, Math.min(3, changed));
}

export function bytesOfDataUrl(url: string): Uint8Array {
  const m = /^data:[^,]*?(;base64)?,(.*)$/s.exec(url);
  if (!m) return new Uint8Array(0);
  const body = m[2] ?? '';
  if (!m[1]) return new TextEncoder().encode(decodeURIComponent(body));
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
