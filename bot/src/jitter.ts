export function backoffMs(attempt: number, ceilMs: number, rnd: () => number = Math.random): number {
  const base = Math.max(1, Math.round(ceilMs / 3));
  const cap = Math.min(ceilMs, base * Math.pow(2, attempt));
  return Math.floor(rnd() * cap);
}

export function retryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.startsWith('wire did not come up')) return true;
  const m = /^wire closed before the oath, code (\d+)/.exec(msg);
  return m !== null && Number(m[1]) < 4000;
}

export interface RetryOpts {
  tries: number;
  ceilMs: number;
  rnd?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, waitMs: number, err: unknown) => void;
}

export async function withJitter<T>(o: RetryOpts, attempt: () => Promise<T>): Promise<T> {
  const sleep = o.sleep ?? ((ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms)));
  for (let n = 0; ; n++) {
    try {
      return await attempt();
    } catch (e) {
      if (n + 1 >= o.tries || !retryable(e)) throw e;
      const wait = backoffMs(n, o.ceilMs, o.rnd);
      o.onRetry?.(n + 1, wait, e);
      await sleep(wait);
    }
  }
}
