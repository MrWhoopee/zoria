export const SLOT_COLOR: Record<string, string> = { A: '#f2b134', B: '#3fb8af', C: '#d06bd6', K: '#e8e8e8' };

export const TERRAIN_COLOR: Record<string, string> = {
  bare: '#3b4450',
  meadow: '#3f5a3a',
  wood: '#2f4a36',
  sand: '#6b6446',
  marsh: '#3a4a4f',
  hill: '#5a4f45',
  water: '#1d3550',
  mount: '#23272d',
};

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

export function shade(hex: string, level: number): string {
  const n = parseInt(hex.slice(1), 16);
  const k = 1 + level * 0.09;
  const c = (x: number): number => Math.min(255, Math.round(x * k));
  return 'rgb(' + c(n >> 16) + ',' + c((n >> 8) & 255) + ',' + c(n & 255) + ')';
}
