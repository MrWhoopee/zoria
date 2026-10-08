export type Rand = () => number;

const TAU = Math.PI * 2;

function lowpass(x: Float32Array, hz: number, sr: number): Float32Array {
  const a = 1 - Math.exp((-TAU * hz) / sr);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += a * ((x[i] ?? 0) - y);
    x[i] = y;
  }
  return x;
}

function highpass(x: Float32Array, hz: number, sr: number): Float32Array {
  const low = lowpass(Float32Array.from(x), hz, sr);
  for (let i = 0; i < x.length; i++) x[i] = (x[i] ?? 0) - (low[i] ?? 0);
  return x;
}

function band(x: Float32Array, lo: number, hi: number, sr: number): Float32Array {
  return lowpass(highpass(x, lo, sr), hi, sr);
}

function noise(n: number, rnd: Rand): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = rnd() * 2 - 1;
  return x;
}

function normalize(x: Float32Array, peak: number): Float32Array {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m === 0) return x;
  const k = peak / m;
  for (let i = 0; i < x.length; i++) x[i] = (x[i] ?? 0) * k;
  return x;
}

function decay(x: Float32Array, sec: number, sr: number, attack = 0.002): Float32Array {
  const tau = sec / 6.9;
  const att = Math.max(1, Math.round(attack * sr));
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    const env = Math.exp(-t / tau) * Math.min(1, i / att);
    x[i] = (x[i] ?? 0) * env;
  }
  return x;
}

function mix(...parts: [Float32Array, number][]): Float32Array {
  const n = Math.max(...parts.map(([p, at]) => p.length + at));
  const out = new Float32Array(n);
  for (const [p, at] of parts) for (let i = 0; i < p.length; i++) out[at + i] = (out[at + i] ?? 0) + (p[i] ?? 0);
  return out;
}

function sweep(sr: number, sec: number, from: number, to: number, wave: (ph: number) => number): Float32Array {
  const n = Math.round(sec * sr);
  const x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const f = from * Math.pow(to / from, i / n);
    ph += f / sr;
    x[i] = wave(ph);
  }
  return x;
}

const sine = (ph: number): number => Math.sin(TAU * ph);
const square = (ph: number): number => (ph % 1 < 0.5 ? 1 : -1);
const triangle = (ph: number): number => 1 - 4 * Math.abs((ph % 1) - 0.5);
const saw = (ph: number): number => 2 * (ph % 1) - 1;

export function click(sr: number, rnd: Rand, lo: number, hi: number, sec: number, peak: number): Float32Array {
  return normalize(decay(band(noise(Math.round(sec * sr), rnd), lo, hi, sr), sec, sr, 0.0005), peak);
}

export function hum(sr: number, rnd: Rand): Float32Array {
  const n = 2 * sr;
  const tone = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    tone[i] = 0.6 * Math.sin(TAU * 50 * t) + 0.3 * Math.sin(TAU * 100 * t) + 0.15 * Math.sin(TAU * 150 * t);
  }
  const air = normalize(lowpass(noise(n, rnd), 380, sr), 0.9);
  const fade = Math.round(0.04 * sr);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    const j = n - fade + i;
    air[i] = (air[i] ?? 0) * k + (air[j] ?? 0) * (1 - k);
  }
  return normalize(mix([tone, 0], [air.subarray(0, n - fade), 0]).subarray(0, n - fade), 0.03);
}

export function motor(sr: number): Float32Array {
  const n = 2 * sr;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    x[i] = saw(60 * t) * (0.85 + 0.15 * Math.sin(TAU * 2 * t));
  }
  return normalize(lowpass(lowpass(x, 260, sr), 260, sr).slice(sr), 0.025);
}

export function air(sr: number, rnd: Rand): Float32Array {
  const n = 2 * sr;
  const x = band(noise(n, rnd), 1200, 3600, sr);
  const fade = Math.round(0.05 * sr);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    x[i] = (x[i] ?? 0) * k + (x[n - fade + i] ?? 0) * (1 - k);
  }
  return normalize(x.subarray(0, n - fade), 0.02);
}

export function bell(sr: number): Float32Array {
  const a = decay(sweep(sr, 1.3, 1320, 1320, sine), 1.3, sr);
  const b = decay(sweep(sr, 1.0, 1980, 1980, sine), 1.0, sr);
  const c = decay(sweep(sr, 0.7, 3643, 3643, sine), 0.7, sr);
  return normalize(mix([a, 0], [b, 0], [c, 0]), 0.16);
}

export function buzz(sr: number): Float32Array {
  const one = lowpass(decay(sweep(sr, 0.22, 110, 110, square), 0.6, sr, 0.01), 1400, sr);
  return normalize(mix([one, 0], [one, Math.round(0.3 * sr)]), 0.07);
}

export function thump(sr: number, rnd: Rand): Float32Array {
  const body = decay(sweep(sr, 0.3, 85, 38, sine), 0.3, sr, 0.006);
  const hit = normalize(decay(lowpass(noise(Math.round(0.12 * sr), rnd), 700, sr), 0.12, sr, 0.001), 0.8);
  return normalize(mix([body, 0], [hit, 0]), 0.42);
}

export function spool(sr: number, rnd: Rand, up: boolean): Float32Array {
  const tone = decay(sweep(sr, 0.22, up ? 520 : 1300, up ? 1300 : 520, triangle), 0.5, sr, 0.03);
  const hiss = normalize(decay(band(noise(Math.round(0.2 * sr), rnd), 900, 2600, sr), 0.2, sr, 0.03), 0.8);
  return normalize(mix([tone, 0], [hiss, 0]), 0.05);
}

export function cassette(sr: number, rnd: Rand): Float32Array {
  const low = normalize(decay(lowpass(noise(Math.round(0.07 * sr), rnd), 500, sr), 0.07, sr, 0.001), 1);
  const snap = click(sr, rnd, 1500, 3200, 0.03, 0.5);
  const body = decay(sweep(sr, 0.09, 110, 70, sine), 0.09, sr);
  const at = Math.round(0.05 * sr);
  return normalize(mix([low, 0], [snap, at], [body, at]), 0.32);
}

export function knob(sr: number, rnd: Rand): Float32Array {
  return normalize(mix([click(sr, rnd, 2600, 4200, 0.025, 1), 0], [click(sr, rnd, 1400, 2400, 0.03, 0.6), Math.round(0.035 * sr)]), 0.17);
}

export function press(sr: number, rnd: Rand): Float32Array {
  const body = decay(sweep(sr, 0.07, 140, 90, sine), 0.07, sr);
  return normalize(mix([click(sr, rnd, 900, 2200, 0.05, 1), 0], [body, 0]), 0.22);
}
