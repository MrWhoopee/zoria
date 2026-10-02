export const S3 = Math.sqrt(3);

export function toPx(q: number, r: number, size: number, cx: number, cy: number): [number, number] {
  return [cx + size * S3 * (q + r / 2), cy + size * 1.5 * r];
}

export function toHex(x: number, y: number, size: number, cx: number, cy: number): { q: number; r: number } {
  const r = (y - cy) / (1.5 * size);
  const q = (x - cx) / (S3 * size) - r / 2;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(-q - r);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs + q + r);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq + 0, r: rr + 0 };
}

export function hexDist(a: { q: number; r: number }, b: { q: number; r: number }): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
}
