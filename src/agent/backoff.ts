const CEILING_MS = 60_000;

export function backoffMs(attempt: number, rand: () => number = Math.random): number {
  const window = Math.min(CEILING_MS, 1000 * 2 ** Math.max(0, attempt));
  return Math.round(rand() * window);
}
