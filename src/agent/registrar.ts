import { fetchRaw } from './http.ts';
import { saveState, type AgentState, type Application } from './store.ts';
import type { EtherState } from '../protocol/ether.ts';

export type RegistrarPhase =
  | 'no-application' | 'no-invitation' | 'listening'
  | 'registering' | 'lost' | 'registered' | 'blocked';

export type RegistrarOptions = {
  api: string;
  statePath: string;
  state: AgentState;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const JSON_HEADERS = { 'content-type': 'application/json' };

function errorCode(body: string): string | null {
  try {
    const v = JSON.parse(body) as { error?: { code?: unknown } };
    return typeof v.error?.code === 'string' ? v.error.code : null;
  } catch {
    return null;
  }
}

type Session = { token: string; sessionId: string; expiresAt: string };

function asSession(body: string): Session | null {
  try {
    const v = JSON.parse(body) as Partial<Session>;
    if (typeof v.token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v.token)) {
      return { token: v.token, sessionId: v.sessionId ?? '', expiresAt: v.expiresAt ?? '' };
    }
    return null;
  } catch {
    return null;
  }
}

export class Registrar {
  readonly #opts: Required<RegistrarOptions>;
  #state: AgentState;
  #phase: RegistrarPhase;
  #blockedReason: string | null = null;
  #busy = false;
  #lastWindowOpen: EtherState | null = null;

  constructor(opts: RegistrarOptions) {
    this.#opts = {
      timeoutMs: 20_000,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: Date.now,
      ...opts,
    };
    this.#state = opts.state;
    this.#phase = this.#derivePhase();
  }

  #derivePhase(): RegistrarPhase {
    const { application, registration } = this.#state;
    if (registration.token) return 'registered';
    if (registration.attemptedAt) return 'lost';
    if (!application) return 'no-application';
    if (!application.invitation) return 'no-invitation';
    return 'listening';
  }

  phase(): RegistrarPhase { return this.#phase; }
  blockedReason(): string | null { return this.#blockedReason; }

  async setApplication(app: Application): Promise<void> {
    this.#state = { ...this.#state, application: app };
    await saveState(this.#opts.statePath, this.#state);
    if (this.#phase !== 'registered' && this.#phase !== 'lost') {
      this.#phase = this.#derivePhase();
    }
  }

  async setInvitation(code: string): Promise<void> {
    if (!this.#state.application) throw new Error('application is not set');
    await this.setApplication({ ...this.#state.application, invitation: code });
    if (this.#lastWindowOpen) await this.onEther(this.#lastWindowOpen);
  }

  async onEther(ether: EtherState): Promise<void> {
    if (ether.silentUntil > this.#opts.now()) return;
    this.#lastWindowOpen = ether.phase === 'window' ? ether : null;
    if (this.#busy) return;
    if (this.#phase === 'registered' || this.#phase === 'blocked') return;

    if (this.#phase === 'lost') {
      this.#busy = true;
      try { await this.#login(); } finally { this.#busy = false; }
      return;
    }

    this.#phase = this.#derivePhase();
    if (this.#phase !== 'listening') return;
    if (ether.phase !== 'window') return;

    this.#busy = true;
    try { await this.#register(); } finally { this.#busy = false; }
  }

  async #persist(patch: Partial<AgentState['registration']>): Promise<void> {
    const next: AgentState = {
      ...this.#state,
      registration: { ...this.#state.registration, ...patch },
    };
    await saveState(this.#opts.statePath, next);
    this.#state = next;
  }

  async #register(): Promise<void> {
    const app = this.#state.application;
    if (!app || !app.invitation) { this.#phase = this.#derivePhase(); return; }

    this.#phase = 'registering';
    await this.#persist({ attemptedAt: new Date().toISOString() });

    for (;;) {
      const res = await fetchRaw(`${this.#opts.api}/auth/register`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          username: app.username, displayName: app.displayName, password: app.password,
          invitation: app.invitation, repositoryUrl: app.repositoryUrl, lang: app.lang,
        }),
      }, this.#opts.timeoutMs);

      if ('failed' in res) { this.#phase = 'lost'; await this.#login(); return; }

      const session = asSession(res.body);
      if (res.status >= 200 && res.status < 300) {
        if (session) { await this.#accept(session); return; }
        this.#phase = 'lost';
        await this.#login();
        return;
      }

      const code = errorCode(res.body);

      if (res.status === 429 && code === 'authentication-busy') {
        await this.#opts.sleep((res.retryAfterSeconds ?? 5) * 1000);
        continue;
      }
      if (res.status === 429) {
        await this.#opts.sleep((res.retryAfterSeconds ?? 60) * 1000);
        continue;
      }
      if (res.status === 409 && code === 'username-unavailable') {
        this.#phase = 'lost'; await this.#login(); return;
      }
      if (res.status >= 500) { this.#phase = 'lost'; await this.#login(); return; }

      this.#phase = 'blocked';
      this.#blockedReason = code ?? `HTTP ${res.status}`;
      return;
    }
  }

  async #login(): Promise<void> {
    const app = this.#state.application;
    if (!app) { this.#phase = 'no-application'; return; }

    const res = await fetchRaw(`${this.#opts.api}/auth/login`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: app.username, password: app.password }),
    }, this.#opts.timeoutMs);

    if ('failed' in res) { this.#phase = 'lost'; return; }

    const session = asSession(res.body);
    if (res.status === 200 && session) { await this.#accept(session); return; }

    if (res.status === 401) {
      await this.#persist({ attemptedAt: null });
      this.#phase = this.#derivePhase();
      return;
    }
    this.#phase = 'lost';
  }

  async #accept(s: Session): Promise<void> {
    await this.#persist({ token: s.token, sessionId: s.sessionId, expiresAt: s.expiresAt });
    this.#phase = 'registered';
  }
}
