import { RateBudget } from './budget.ts';
import { backoffMs } from './backoff.ts';
import { fetchRaw } from './http.ts';
import { classifyResponse, type Observation } from '../protocol/classify.ts';
import { initialEther, reduceEther, type EtherState } from '../protocol/ether.ts';
import type { KeyRing } from '../protocol/keyring.ts';
import type { RollEntry } from '../protocol/types.ts';

export type EtherLoopOptions = {
  api: string;
  ring: KeyRing;
  timeoutMs: number;
  intervalMs: number;
  capacity: number;
  refillMs: number;
  now?: () => number;
  rand?: () => number;
  initial?: EtherState;
};

export type RollResult =
  | { ok: true; entries: RollEntry[]; at: number }
  | { ok: false; reason: 'too-soon' | 'silent' | 'budget' | 'jammed' | 'stopping' | 'noise' | 'timeout' | 'network'; retryInMs: number };

const ROLL_EVERY_MS = 60_000;

type Listener = (s: EtherState, o: Observation) => void;
type ErrorListener = (err: unknown) => void;

export class EtherLoop {
  readonly #opts: Required<Omit<EtherLoopOptions, 'initial'>>;
  readonly #budget: RateBudget;
  #state: EtherState = initialEther();
  #failures = 0;
  #blockedUntil = 0;
  #timer: NodeJS.Timeout | null = null;
  #listeners: Listener[] = [];
  #errorListeners: ErrorListener[] = [];
  #roll: { entries: RollEntry[]; at: number } | null = null;
  #rollTriedAt: number | null = null;

  constructor(opts: EtherLoopOptions) {
    this.#opts = { now: Date.now, rand: Math.random, ...opts };
    this.#budget = new RateBudget({ capacity: opts.capacity, refillMs: opts.refillMs });
    this.#state = opts.initial ?? initialEther();
  }

  state(): EtherState { return this.#state; }
  failures(): number { return this.#failures; }
  on(fn: Listener): void { this.#listeners.push(fn); }
  onError(fn: ErrorListener): void { this.#errorListeners.push(fn); }

  #emit(o: Observation): void {
    this.#state = reduceEther(this.#state, o);
    if (this.#state.silentUntil > 0) this.#budget.silence(this.#state.silentUntil);
    for (const fn of this.#listeners) fn(this.#state, o);
  }

  async tickOnce(): Promise<void> {
    const now = this.#opts.now();
    if (now < this.#blockedUntil) return;
    if (!this.#budget.tryTake(now)) return;

    const raw = await fetchRaw(`${this.#opts.api}/ether`, {}, this.#opts.timeoutMs, this.#opts.now);

    if ('failed' in raw) {
      this.#failures += 1;
      this.#blockedUntil = raw.receivedAt + backoffMs(this.#failures - 1, this.#opts.rand);
      this.#emit({
        t: 'silence',
        reason: raw.failed === 'timeout' ? 'timeout' : 'network',
        receivedAt: raw.receivedAt,
      });
      return;
    }

    const o = await classifyResponse(raw, this.#opts.ring);
    if (o.t !== 'stopping' && o.t !== 'jammed') this.#failures = 0;
    this.#emit(o);
  }

  async roll(): Promise<RollResult> {
    const now = this.#opts.now();
    if (this.#rollTriedAt !== null && now - this.#rollTriedAt < ROLL_EVERY_MS) {
      if (this.#roll) return { ok: true, entries: this.#roll.entries, at: this.#roll.at };
      return { ok: false, reason: 'too-soon', retryInMs: this.#rollTriedAt + ROLL_EVERY_MS - now };
    }
    const quietUntil = Math.max(this.#blockedUntil, this.#state.silentUntil);
    if (now < quietUntil) return { ok: false, reason: 'silent', retryInMs: quietUntil - now };
    if (!this.#budget.tryTake(now)) return { ok: false, reason: 'budget', retryInMs: this.#budget.msUntilToken(now) };

    this.#rollTriedAt = now;
    const raw = await fetchRaw(`${this.#opts.api}/ether/roll`, {}, this.#opts.timeoutMs, this.#opts.now);
    if ('failed' in raw) return { ok: false, reason: raw.failed, retryInMs: ROLL_EVERY_MS };

    const o = await classifyResponse(raw, this.#opts.ring);
    if (o.t === 'jammed' || o.t === 'stopping') {
      this.#emit(o);
      return { ok: false, reason: o.t, retryInMs: o.retryAfterMs };
    }
    if (o.t !== 'signal' || o.frame.kind !== 'roll') return { ok: false, reason: 'noise', retryInMs: ROLL_EVERY_MS };

    const entries = (o.frame.roll ?? []).filter((e) => Number.isInteger(e.n) && typeof e.name === 'string');
    this.#roll = { entries, at: now };
    return { ok: true, entries, at: now };
  }

  start(): void {
    if (this.#timer) return;
    const tick = (): void => {
      this.tickOnce().catch((err: unknown) => {
        for (const fn of this.#errorListeners) fn(err);
      });
    };
    this.#timer = setInterval(tick, this.#opts.intervalMs);
    tick();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }
}
