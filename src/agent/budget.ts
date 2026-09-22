export class RateBudget {
  readonly #capacity: number;
  readonly #refillMs: number;
  #tokens: number;
  #lastRefill = 0;
  #silentUntil = 0;

  constructor(opts: { capacity: number; refillMs: number }) {
    this.#capacity = opts.capacity;
    this.#refillMs = opts.refillMs;
    this.#tokens = opts.capacity;
  }

  #refill(now: number): void {
    if (now <= this.#lastRefill) return;
    const gained = Math.floor((now - this.#lastRefill) / this.#refillMs);
    if (gained <= 0) return;
    if (this.#tokens + gained >= this.#capacity) {
      this.#tokens = this.#capacity;
      this.#lastRefill = now;
      return;
    }
    this.#tokens += gained;
    this.#lastRefill += gained * this.#refillMs;
  }

  tryTake(now: number): boolean {
    if (now < this.#silentUntil) return false;
    this.#refill(now);
    if (this.#tokens <= 0) return false;
    this.#tokens -= 1;
    return true;
  }

  msUntilToken(now: number): number {
    if (now < this.#silentUntil) return this.#silentUntil - now;
    this.#refill(now);
    if (this.#tokens > 0) return 0;
    return this.#lastRefill + this.#refillMs - now;
  }

  silence(untilMs: number): void {
    this.#silentUntil = Math.max(this.#silentUntil, untilMs);
  }

  silentUntil(): number {
    return this.#silentUntil;
  }
}
