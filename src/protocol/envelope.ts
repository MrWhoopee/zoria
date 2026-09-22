import type { Envelope, Frame } from './types.ts';
import type { KeyRing } from './keyring.ts';
import { verifySeal } from './seal.ts';

export type NoiseReason =
  | 'not-json' | 'bad-shape' | 'unknown-key'
  | 'bad-seal' | 'bad-frame' | 'wrong-version' | 'wrong-station';

export type Verdict =
  | { kind: 'signal'; frame: Frame; keyId: string }
  | { kind: 'noise'; why: NoiseReason };

function isEnvelope(v: unknown): v is Envelope {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const e = v as Record<string, unknown>;
  return typeof e.frame === 'string'
    && typeof e.seal === 'string'
    && typeof e.key === 'string'
    && /^[0-9a-f]{16}$/.test(e.key);
}

export async function verifyEnvelope(rawBody: string, ring: KeyRing): Promise<Verdict> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { kind: 'noise', why: 'not-json' };
  }
  if (!isEnvelope(parsed)) return { kind: 'noise', why: 'bad-shape' };

  const key = ring.get(parsed.key);
  if (!key) return { kind: 'noise', why: 'unknown-key' };

  if (!(await verifySeal(key, parsed.seal, parsed.frame))) {
    return { kind: 'noise', why: 'bad-seal' };
  }

  let frame: unknown;
  try {
    frame = JSON.parse(parsed.frame);
  } catch {
    return { kind: 'noise', why: 'bad-frame' };
  }
  if (typeof frame !== 'object' || frame === null || Array.isArray(frame)) {
    return { kind: 'noise', why: 'bad-frame' };
  }
  const f = frame as Frame;
  if (f.v !== 1) return { kind: 'noise', why: 'wrong-version' };
  if (f.station !== 'zoria') return { kind: 'noise', why: 'wrong-station' };

  return { kind: 'signal', frame: f, keyId: parsed.key };
}
