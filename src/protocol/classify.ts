import type { Frame } from './types.ts';
import type { KeyRing } from './keyring.ts';
import { verifyEnvelope, type NoiseReason } from './envelope.ts';

export type Observation =
  | { t: 'signal'; frame: Frame; frameAt: number; receivedAt: number }
  | { t: 'noise'; why: NoiseReason; status: number; receivedAt: number }
  | { t: 'jammed'; retryAfterMs: number; receivedAt: number }
  | { t: 'stopping'; retryAfterMs: number; receivedAt: number }
  | { t: 'silence'; reason: 'timeout' | 'network' | 'aborted'; receivedAt: number };

export type RawResponse = {
  status: number;
  retryAfterSeconds: number | null;
  body: string;
  receivedAt: number;
};

const DEFAULT_JAM_MS = 60_000;
const DEFAULT_STOPPING_MS = 30_000;

function errorCode(body: string): string | null {
  try {
    const v = JSON.parse(body);
    const code = (v as { error?: { code?: unknown } })?.error?.code;
    return typeof code === 'string' ? code : null;
  } catch {
    return null;
  }
}

export async function classifyResponse(r: RawResponse, ring: KeyRing): Promise<Observation> {
  if (r.status === 429) {
    const ms = r.retryAfterSeconds !== null ? r.retryAfterSeconds * 1000 : DEFAULT_JAM_MS;
    return { t: 'jammed', retryAfterMs: ms, receivedAt: r.receivedAt };
  }

  const verdict = await verifyEnvelope(r.body, ring);
  if (verdict.kind === 'signal') {
    return {
      t: 'signal',
      frame: verdict.frame,
      frameAt: Date.parse(verdict.frame.at),
      receivedAt: r.receivedAt,
    };
  }

  if (r.status >= 500 && errorCode(r.body) === 'stopping') {
    const ms = r.retryAfterSeconds !== null ? r.retryAfterSeconds * 1000 : DEFAULT_STOPPING_MS;
    return { t: 'stopping', retryAfterMs: ms, receivedAt: r.receivedAt };
  }

  return { t: 'noise', why: verdict.why, status: r.status, receivedAt: r.receivedAt };
}
