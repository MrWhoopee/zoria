import { fetchRaw } from './http.ts';
import { backoffMs } from './backoff.ts';
import { asGrant, errorCode } from './wire.ts';
import type { StateBox } from './store.ts';

export type SignInFailure = { status: number; code: string | null; retryAfter: number | null };

export type SessionState = 'none' | 'active' | 'expired' | 'renewing' | 'logged-out' | 'rejected';

export type SessionOptions = {
  api: string;
  store: StateBox;
  timeoutMs?: number;
  now?: () => number;
  rand?: () => number;
  renewBeforeMs?: number;
};

const JSON_HEADERS = { 'content-type': 'application/json' };
const DAY_MS = 86_400_000;

export class Session {
  readonly #opts: Required<SessionOptions>;
  #mode: 'auto' | 'logged-out' | 'rejected' = 'auto';
  #pending: Promise<string | null> | null = null;
  #retryAt = 0;
  #holdUntil = 0;
  #failures = 0;
  #lastError: string | null = null;
  #lastFailure: SignInFailure | null = null;

  constructor(opts: SessionOptions) {
    this.#opts = { timeoutMs: 20_000, now: Date.now, rand: Math.random, renewBeforeMs: 600_000, ...opts };
  }

  state(): SessionState {
    if (!this.#opts.store.get().registration.registered) return 'none';
    if (this.#mode !== 'auto') return this.#mode;
    if (this.#pending) return 'renewing';
    return this.#fresh() ? 'active' : 'expired';
  }

  expiresAt(): string | null {
    return this.#opts.store.get().registration.expiresAt;
  }

  lastError(): string | null {
    return this.#lastError;
  }

  lastFailure(): SignInFailure | null {
    return this.#lastFailure;
  }

  #fresh(): boolean {
    const { token, expiresAt } = this.#opts.store.get().registration;
    if (!token || !expiresAt) return false;
    const end = Date.parse(expiresAt);
    return Number.isFinite(end) && end - this.#opts.now() > this.#opts.renewBeforeMs;
  }

  #mayAutoSignIn(): boolean {
    return this.#mode === 'auto' && this.#opts.store.get().registration.registered;
  }

  async token(): Promise<string | null> {
    if (!this.#mayAutoSignIn()) return null;
    if (this.#fresh()) return this.#opts.store.get().registration.token;
    return this.#signIn();
  }

  async renew(stale: string): Promise<string | null> {
    if (!this.#mayAutoSignIn()) return null;
    const current = this.#opts.store.get().registration.token;
    if (current !== null && current !== stale && this.#fresh()) return current;
    return this.#signIn();
  }

  async login(): Promise<boolean> {
    if (!this.#opts.store.get().registration.registered) return false;
    this.#mode = 'auto';
    this.#retryAt = 0;
    if (this.#fresh()) return true;
    if (this.#opts.now() < this.#holdUntil) return false;
    return (await this.#signIn()) !== null;
  }

  async logout(): Promise<void> {
    this.#mode = 'logged-out';
    const token = this.#opts.store.get().registration.token;
    await this.#opts.store.update((s) => ({
      ...s, registration: { ...s.registration, token: null, sessionId: null, expiresAt: null },
    }));
    if (token !== null) await this.#revoke(token);
  }

  async #revoke(token: string): Promise<void> {
    const res = await fetchRaw(`${this.#opts.api}/auth/logout`, {
      method: 'POST',
      headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
      body: '{}',
    }, this.#opts.timeoutMs, this.#opts.now);
    this.#lastError = 'failed' in res ? res.failed : null;
  }

  #signIn(): Promise<string | null> {
    if (this.#pending) return this.#pending;
    const now = this.#opts.now();
    if (now < this.#retryAt || now < this.#holdUntil) return Promise.resolve(null);
    const run = this.#requestSignIn().finally(() => { this.#pending = null; });
    this.#pending = run;
    return run;
  }

  async #requestSignIn(): Promise<string | null> {
    const app = this.#opts.store.get().application;
    if (!app) {
      this.#lastError = 'no-application';
      return null;
    }
    const res = await fetchRaw(`${this.#opts.api}/auth/login`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: app.username, password: app.password }),
    }, this.#opts.timeoutMs, this.#opts.now);
    if ('failed' in res) return this.#fail(res.failed, 0);

    const grant = asGrant(res.body);
    if (res.status === 200 && grant) {
      if (this.#mode !== 'auto') {
        await this.#revoke(grant.token);
        return null;
      }
      const expiresAt = Number.isFinite(Date.parse(grant.expiresAt))
        ? grant.expiresAt
        : new Date(this.#opts.now() + DAY_MS).toISOString();
      try {
        await this.#opts.store.update((s) => ({
          ...s,
          registration: { ...s.registration, token: grant.token, sessionId: grant.sessionId, expiresAt },
        }));
      } catch {
        return this.#fail('state-write', 0);
      }
      this.#failures = 0;
      this.#lastError = null;
      this.#lastFailure = null;
      return grant.token;
    }

    const code = errorCode(res.body);
    if (res.status === 401 && code === 'invalid-credentials') {
      this.#mode = 'rejected';
      this.#lastError = code;
      this.#lastFailure = { status: 401, code, retryAfter: null };
      return null;
    }
    if (res.status === 429) {
      const seconds = res.retryAfterSeconds ?? (code === 'authentication-busy' ? 5 : 60);
      this.#holdUntil = this.#opts.now() + seconds * 1000;
      this.#lastError = code ?? 'rate-limited';
      this.#lastFailure = { status: 429, code, retryAfter: seconds };
      return null;
    }
    return this.#fail(code ?? `http-${res.status}`, res.status, code);
  }

  #fail(reason: string, status: number, code: string | null = reason): null {
    this.#lastError = reason;
    this.#lastFailure = { status, code, retryAfter: null };
    this.#retryAt = this.#opts.now() + backoffMs(this.#failures, this.#opts.rand);
    this.#failures += 1;
    return null;
  }
}
