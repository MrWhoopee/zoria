import { fetchRaw } from './http.ts';
import { asGrant, errorCode, type Grant } from './wire.ts';
import type { AgentState, Application, StateBox } from './store.ts';
import type { EtherState } from '../protocol/ether.ts';

export type RegistrarPhase =
  | 'no-application' | 'no-invitation' | 'listening'
  | 'registering' | 'lost' | 'registered' | 'blocked';

export type RegistrarOptions = {
  api: string;
  store: StateBox;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const JSON_HEADERS = { 'content-type': 'application/json' };

export class Registrar {
  readonly #opts: Required<RegistrarOptions>;
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
    this.#phase = this.#derivePhase();
  }

  #derivePhase(): RegistrarPhase {
    const { application, registration } = this.#opts.store.get();
    if (registration.registered) return 'registered';
    if (registration.attemptedAt) return 'lost';
    if (!application) return 'no-application';
    if (!application.invitation) return 'no-invitation';
    return 'listening';
  }

  phase(): RegistrarPhase { return this.#phase; }
  blockedReason(): string | null { return this.#blockedReason; }

  async setApplication(app: Application): Promise<void> {
    await this.#opts.store.update((s) => ({ ...s, application: app }));
    if (this.#phase !== 'registered' && this.#phase !== 'lost') {
      this.#phase = this.#derivePhase();
    }
  }

  async remember(ether: AgentState['ether']): Promise<void> {
    await this.#opts.store.update((s) => ({ ...s, ether }));
  }

  async setInvitation(code: string): Promise<void> {
    const app = this.#opts.store.get().application;
    if (!app) throw new Error('application is not set');
    await this.setApplication({ ...app, invitation: code });
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
    await this.#opts.store.update((s) => ({ ...s, registration: { ...s.registration, ...patch } }));
  }

  async #register(): Promise<void> {
    const app = this.#opts.store.get().application;
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

      const grant = asGrant(res.body);
      if (res.status >= 200 && res.status < 300) {
        if (grant) { await this.#accept(grant); return; }
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
    const app = this.#opts.store.get().application;
    if (!app) { this.#phase = 'no-application'; return; }

    const res = await fetchRaw(`${this.#opts.api}/auth/login`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: app.username, password: app.password }),
    }, this.#opts.timeoutMs);

    if ('failed' in res) { this.#phase = 'lost'; return; }

    const grant = asGrant(res.body);
    if (res.status === 200 && grant) { await this.#accept(grant); return; }

    if (res.status === 401) {
      await this.#persist({ attemptedAt: null });
      this.#phase = this.#derivePhase();
      return;
    }
    this.#phase = 'lost';
  }

  async #accept(g: Grant): Promise<void> {
    await this.#persist({ registered: true, token: g.token, sessionId: g.sessionId, expiresAt: g.expiresAt });
    this.#phase = 'registered';
  }
}
