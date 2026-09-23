import type { FlickerEvent } from '../scene/flicker.ts';
import { HUM_LEVEL, HUM_PARTIALS, crackleParams, dipGain } from './voices.ts';

export type SampleName = 'relay' | 'crtOn' | 'crtOff' | 'key1' | 'key2' | 'key3' | 'space';

export type AudioEngine = {
  load(): void;
  unlock(): void;
  setLit(on: boolean): void;
  flicker(e: FlickerEvent): void;
  play(name: SampleName): void;
  key(code: string): void;
  close(): void;
};

const KEY_SAMPLES = ['key1', 'key2', 'key3'] as const;

export function createAudioEngine(urls: Partial<Record<SampleName, string>>): AudioEngine {
  let ctx: AudioContext | null = null;
  let hum: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  const buffers = new Map<SampleName, AudioBuffer>();
  let lit = false;
  let keyTurn = 0;

  function load(): void {
    if (ctx) return;
    const c = new AudioContext();
    const bus = c.createGain();
    bus.gain.value = 0;
    bus.connect(c.destination);
    for (const partial of HUM_PARTIALS) {
      const osc = c.createOscillator();
      osc.frequency.value = partial.hz;
      const g = c.createGain();
      g.gain.value = partial.gain;
      osc.connect(g).connect(bus);
      osc.start();
    }
    const n = c.createBuffer(1, Math.floor(c.sampleRate * 0.25), c.sampleRate);
    const data = n.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    ctx = c;
    hum = bus;
    noise = n;
    for (const [name, url] of Object.entries(urls) as Array<[SampleName, string]>) {
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((bytes) => c.decodeAudioData(bytes))
        .then((buffer) => { buffers.set(name, buffer); })
        .catch((err: unknown) => { console.warn(`sample ${name} failed to load:`, err); });
    }
  }

  function unlock(): void {
    load();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch((err: unknown) => { console.warn('audio could not resume:', err); });
    }
  }

  function setLit(on: boolean): void {
    lit = on;
    if (!ctx || !hum) return;
    hum.gain.setTargetAtTime(on ? HUM_LEVEL : 0, ctx.currentTime, on ? 0.4 : 0.15);
  }

  function flicker(e: FlickerEvent): void {
    if (!ctx || !hum || !noise || !lit) return;
    const t = ctx.currentTime;
    hum.gain.setTargetAtTime(HUM_LEVEL * dipGain(e.depth), t, 0.01);
    hum.gain.setTargetAtTime(HUM_LEVEL, t + e.durationMs / 1000, 0.03);
    const p = crackleParams(e, Math.random);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = p.cutoffHz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(p.peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + p.decayMs / 1000);
    src.connect(band).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + p.decayMs / 1000 + 0.02);
  }

  function play(name: SampleName): void {
    if (!ctx) return;
    const buffer = buffers.get(name);
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start();
  }

  function key(code: string): void {
    if (code === 'Space') {
      play('space');
      return;
    }
    keyTurn = (keyTurn + 1) % KEY_SAMPLES.length;
    play(KEY_SAMPLES[keyTurn]);
  }

  function close(): void {
    const c = ctx;
    ctx = null;
    hum = null;
    noise = null;
    buffers.clear();
    if (c) c.close().catch((err: unknown) => { console.warn('audio close failed:', err); });
  }

  return { load, unlock, setLit, flicker, play, key, close };
}
