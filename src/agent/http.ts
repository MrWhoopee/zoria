import type { RawResponse } from '../protocol/classify.ts';

export type Failure = { failed: 'timeout' | 'network'; receivedAt: number };

function retryAfterSeconds(headers: Headers): number | null {
  const raw = headers.get('retry-after');
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function fetchRaw(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  now: () => number = Date.now,
): Promise<RawResponse | Failure> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, redirect: 'manual' });
    const body = await res.text();
    return {
      status: res.status,
      retryAfterSeconds: retryAfterSeconds(res.headers),
      body,
      receivedAt: now(),
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { failed: aborted ? 'timeout' : 'network', receivedAt: now() };
  } finally {
    clearTimeout(timer);
  }
}
