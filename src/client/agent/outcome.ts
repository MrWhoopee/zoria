import type { Failure } from '../terminal/errors.ts';

export type Outcome = ({ ok: true } & Record<string, unknown>) | ({ ok: false } & Failure);

export const OFFLINE: Failure = { status: 0, code: 'agent-offline', requestId: null, retryAfter: null };

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export function readOutcome(body: unknown): Outcome {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, status: 0, code: 'bad-reply', requestId: null, retryAfter: null };
  }
  const o = body as Record<string, unknown>;
  if (o.ok === true) return { ...o, ok: true };
  if (o.ok === false) {
    return { ok: false, status: num(o.status) ?? 0, code: str(o.code), requestId: str(o.requestId), retryAfter: num(o.retryAfter) };
  }
  return { ok: false, status: 0, code: 'bad-reply', requestId: null, retryAfter: null };
}
