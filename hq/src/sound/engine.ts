import relayUrl from '../assets/sounds/relay.ogg';
import key1Url from '../assets/sounds/key-1.ogg';
import key2Url from '../assets/sounds/key-2.ogg';
import key3Url from '../assets/sounds/key-3.ogg';
import { air, bell, buzz, cassette, click, hum, knob, motor, press, spool, thump } from './render.ts';
import { FLAP_GAP_MS, Gate, KEY_GAP_MS, SPOOL_GAP_MS, answerSound, bytesOfDataUrl, flapBursts, seekSound } from './voices.ts';

type Voice = 'relay' | 'key1' | 'key2' | 'key3' | 'hum' | 'motor' | 'air' | 'flap1' | 'flap2' | 'flap3' | 'tick' | 'press' | 'knob' | 'cassette' | 'spoolUp' | 'spoolDown' | 'thump' | 'bell' | 'buzz';
type Loop = 'hum' | 'motor' | 'air';

const SR = 22050;
const SAMPLES: [Voice, string][] = [['relay', relayUrl], ['key1', key1Url], ['key2', key2Url], ['key3', key3Url]];
const KEYS: Voice[] = ['key1', 'key2', 'key3'];
const FLAPS: Voice[] = ['flap1', 'flap2', 'flap3'];
const MUTE_KEY = 'zaria-hq-mute';
const MASTER = 0.7;

const RENDER: [Voice, () => Float32Array][] = [
  ['press', () => press(SR, Math.random)],
  ['flap1', () => click(SR, Math.random, 2200, 4200, 0.03, 0.05)],
  ['flap2', () => click(SR, Math.random, 2600, 4800, 0.025, 0.045)],
  ['flap3', () => click(SR, Math.random, 2000, 3800, 0.035, 0.05)],
  ['knob', () => knob(SR, Math.random)],
  ['tick', () => click(SR, Math.random, 2400, 4200, 0.02, 0.06)],
  ['thump', () => thump(SR, Math.random)],
  ['bell', () => bell(SR)],
  ['buzz', () => buzz(SR)],
  ['cassette', () => cassette(SR, Math.random)],
  ['spoolUp', () => spool(SR, Math.random, true)],
  ['spoolDown', () => spool(SR, Math.random, false)],
  ['hum', () => hum(SR, Math.random)],
  ['motor', () => motor(SR)],
  ['air', () => air(SR, Math.random)],
];

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeMuted(on: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, on ? '1' : '0');
  } catch {
    return;
  }
}

function idle(fn: () => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 500 });
  else setTimeout(fn, 30);
}

export class Sound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private readonly buffers = new Map<Voice, AudioBuffer>();
  private readonly want = new Map<Loop, boolean>([['hum', true], ['motor', false], ['air', false]]);
  private readonly loops = new Map<Loop, { src: AudioBufferSourceNode; gain: GainNode }>();
  private readonly flapGate = new Gate(FLAP_GAP_MS);
  private readonly spoolGate = new Gate(SPOOL_GAP_MS);
  private readonly keyGate = new Gate(KEY_GAP_MS);
  private turn = 0;
  muted = readMuted();
  onMute: (muted: boolean) => void = () => undefined;

  unlock(): void {
    if (this.muted) return;
    if (!this.ctx) this.build();
    const c = this.ctx;
    if (c && c.state === 'suspended' && !this.muted) c.resume().then(() => this.syncLoops(), () => undefined);
  }

  toggleMute(): void {
    this.muted = !this.muted;
    writeMuted(this.muted);
    const c = this.ctx;
    if (c && this.out) this.out.gain.setTargetAtTime(this.muted ? 0 : MASTER, c.currentTime, 0.05);
    this.syncLoops();
    if (c && this.muted) c.suspend().catch(() => undefined);
    if (!this.muted) this.unlock();
    this.onMute(this.muted);
  }

  private build(): void {
    let c: AudioContext;
    try {
      c = new AudioContext();
    } catch {
      return;
    }
    const out = c.createGain();
    out.gain.value = this.muted ? 0 : MASTER;
    out.connect(c.destination);
    this.ctx = c;
    this.out = out;
    for (const [name, url] of SAMPLES) {
      const bytes = bytesOfDataUrl(url);
      if (bytes.length > 0) c.decodeAudioData(bytes.slice().buffer).then((b) => this.buffers.set(name, b), () => undefined);
    }
    const queue = [...RENDER];
    const next = (): void => {
      const job = queue.shift();
      if (!job) return;
      const [name, make] = job;
      const data = make();
      const b = c.createBuffer(1, data.length, SR);
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.buffers.set(name, b);
      if (name === 'hum' || name === 'motor' || name === 'air') this.syncLoops();
      idle(next);
    };
    idle(next);
  }

  private running(): AudioContext | null {
    const c = this.ctx;
    if (!c || this.muted || c.state !== 'running' || !this.out) return null;
    return c;
  }

  private play(name: Voice, gain = 1, at = 0): boolean {
    const c = this.running();
    const b = this.buffers.get(name);
    if (!c || !b || !this.out) return false;
    const src = c.createBufferSource();
    src.buffer = b;
    if (gain === 1) src.connect(this.out);
    else {
      const g = c.createGain();
      g.gain.value = gain;
      src.connect(g).connect(this.out);
    }
    src.start(c.currentTime + at);
    return true;
  }

  private syncLoops(): void {
    const c = this.ctx;
    if (!c || !this.out) return;
    for (const [name, on] of this.want) {
      const live = this.loops.get(name);
      const sound = on && !this.muted && c.state === 'running';
      if (sound && !live) {
        const b = this.buffers.get(name);
        if (!b) continue;
        const src = c.createBufferSource();
        src.buffer = b;
        src.loop = true;
        const gain = c.createGain();
        gain.gain.setValueAtTime(0.0001, c.currentTime);
        gain.gain.setTargetAtTime(1, c.currentTime, name === 'hum' ? 1.2 : 0.2);
        src.connect(gain).connect(this.out);
        src.start(c.currentTime, Math.random() * b.duration);
        this.loops.set(name, { src, gain });
      } else if (!sound && live) {
        this.loops.delete(name);
        live.gain.gain.cancelScheduledValues(c.currentTime);
        live.gain.gain.setTargetAtTime(0, c.currentTime, 0.08);
        live.src.stop(c.currentTime + 0.5);
      }
    }
  }

  private loop(name: Loop, on: boolean): void {
    if (this.want.get(name) === on) return;
    this.want.set(name, on);
    this.syncLoops();
  }

  flaps(changed: number): void {
    const n = flapBursts(changed);
    if (n === 0 || !this.running() || !this.flapGate.pass(performance.now())) return;
    for (let i = 0; i < n; i++) this.play(FLAPS[(this.turn + i) % FLAPS.length] ?? 'flap1', 1, i * 0.014);
    this.turn++;
  }

  button(): void {
    if (!this.play('relay', 0.5)) this.play('press');
    else this.play('press', 0.6);
  }

  knob(): void {
    this.play('knob');
  }

  key(): void {
    if (!this.running() || !this.keyGate.pass(performance.now())) return;
    this.turn++;
    if (!this.play(KEYS[this.turn % KEYS.length] ?? 'key1', 0.45)) this.play('tick');
  }

  cassette(): void {
    this.play('cassette');
  }

  seek(from: number, to: number): void {
    const kind = seekSound(from, to);
    if (kind === 'tick') this.play('tick');
    else if (kind === 'spool' && this.running() && this.spoolGate.pass(performance.now())) this.play(to > from ? 'spoolUp' : 'spoolDown');
  }

  lever(): void {
    this.play('thump');
    if (!this.play('relay', 0.6, 0.14)) this.play('press', 1, 0.14);
  }

  answer(status: string): void {
    const kind = answerSound(status);
    if (kind) this.play(kind);
  }

  spin(on: boolean): void {
    this.loop('motor', on);
  }

  airLit(on: boolean): void {
    this.loop('air', on);
  }
}
