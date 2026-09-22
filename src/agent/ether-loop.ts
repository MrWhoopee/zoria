import { RateBudget } from './budget.ts';
import { backoffMs } from './backoff.ts';
import { fetchRaw } from './http.ts';
import { classifyResponse, type Observation } from '../protocol/classify.ts';
import { initialEther, reduceEther, type EtherState } from '../protocol/ether.ts';
import type { KeyRing } from '../protocol/keyring.ts';

export type EtherLoopOptions = {
  api: string;
  ring: KeyRing;
  timeoutMs: number;
  intervalMs: number;
  capacity: number;
  refillMs: number;
  now?: () => number;
  rand?: () => number;
};

type Listener = (s: EtherState, o: Observation) => void;

export class EtherLoop {
  readonly #opts: Required<EtherLoopOptions>;
  readonly #budget: RateBudget;
  #state: EtherState = initialEther();
  #failures = 0;
  #blockedUntil = 0;
  #timer: NodeJS.Timeout | null = null;
  #listeners: Listener[] = [];

  constructor(opts: EtherLoopOptions) {
    this.#opts = { now: Date.now, rand: Math.random, ...opts };
    this.#budget = new RateBudget({ capacity: opts.capacity, refillMs: opts.refillMs });
  }

  state(): EtherState { return this.#state; }
  failures(): number { return this.#failures; }
  on(fn: Listener): void { this.#listeners.push(fn); }

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

  start(): void {
    if (this.#timer) return;
    const tick = (): void => { void this.tickOnce(); };
    this.#timer = setInterval(tick, this.#opts.intervalMs);
    tick();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }
}
