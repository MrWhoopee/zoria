import { backoffMs } from './backoff.ts';
import {
  asMessage, asNews, asPage, asRepository, asStage, asStageList, asSummary, field, isId,
  type Message, type News, type RepoAccess, type Repository, type Stage, type StageSummary, type Summary,
} from './account.ts';
import type { CallError, CallResult, Caller } from './server.ts';

export type AccountError = { what: string; status: number; code: string | null; requestId: string | null };

export type AccountData = {
  summary: Summary | null;
  config: RepoAccess | null;
  repository: Repository | null;
  stages: StageSummary[];
  inbox: Message[];
  news: News[];
  lastError: AccountError | null;
};

export type MailroomOptions = {
  call: Caller;
  loadConfig: () => Promise<RepoAccess | null | undefined>;
  ready: () => boolean;
  intervalMs: number;
  now?: () => number;
  rand?: () => number;
  onError?: (err: unknown) => void;
};

type Seen = { inbox?: number; stages?: string; news?: string | null; repo?: string | null };
type Outcome = 'ok' | 'soft' | 'hard';
type Scroll<T> = { outcome: Outcome; items: T[]; last: Summary };

const PAGE = 100;
const MAX_PAGES = 200;
const MAX_RESTARTS = 3;
const CONFIG_RETRY_MS = 3_600_000;

const emptyData = (): AccountData => ({
  summary: null, config: null, repository: null, stages: [], inbox: [], news: [], lastError: null,
});

const notFound: CallError = { ok: false, status: 404, code: 'not-found', requestId: null, retryAfter: null };

export class Mailroom {
  readonly #opts: Required<MailroomOptions>;
  #data: AccountData = emptyData();
  #stages = new Map<string, Stage>();
  #seen: Seen = {};
  #configLoaded = false;
  #configRetryAt = 0;
  #blockedUntil = 0;
  #failures = 0;
  #running: Promise<void> | null = null;
  #generation = 0;
  #timer: NodeJS.Timeout | null = null;

  constructor(opts: MailroomOptions) {
    this.#opts = {
      now: Date.now,
      rand: Math.random,
      onError: (err) => { console.error('mailroom tick failed:', err instanceof Error ? err.message : err); },
      ...opts,
    };
  }

  data(): AccountData { return this.#data; }
  stage(id: string): Stage | null { return this.#stages.get(id) ?? null; }

  reset(): void {
    this.#generation += 1;
    this.#data = { ...emptyData(), config: this.#data.config };
    this.#stages.clear();
    this.#seen = {};
    this.#blockedUntil = 0;
    this.#failures = 0;
  }

  start(): void {
    if (this.#timer) return;
    const tick = (): void => {
      this.tick().catch((err: unknown) => { this.#opts.onError(err); });
    };
    this.#timer = setInterval(tick, this.#opts.intervalMs);
    tick();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  tick(): Promise<void> {
    if (this.#running) return this.#running;
    const run = this.#tick().finally(() => { this.#running = null; });
    this.#running = run;
    return run;
  }

  async #tick(): Promise<void> {
    if (!this.#opts.ready()) return;
    const gen = this.#generation;
    await this.#refreshConfig(gen);
    if (this.#opts.now() < this.#blockedUntil) return;

    const summary = await this.#readSummary(gen);
    if (!summary) return;
    this.#put(gen, { summary });

    let clean = true;
    const carryOn = (o: Outcome): boolean => {
      if (o !== 'ok') clean = false;
      return o !== 'hard';
    };

    if (this.#seen.inbox !== summary.unread) {
      const r = await this.#readAll(gen, 'inbox', '/inbox', asMessage, summary, (x) => x.unread);
      if (r.outcome === 'ok' && this.#live(gen)) {
        this.#put(gen, { inbox: r.items });
        this.#seen.inbox = r.last.unread;
      }
      if (!carryOn(r.outcome)) return;
    }
    const stagesKey = `${summary.releasedStages}:${summary.acknowledgedStages}:${summary.unread}`;
    if (this.#seen.stages !== stagesKey) {
      const o = await this.#readStages(gen);
      if (o === 'ok' && this.#live(gen)) this.#seen.stages = stagesKey;
      if (!carryOn(o)) return;
    }
    if (!('news' in this.#seen) || this.#seen.news !== summary.latestNews) {
      const r = await this.#readAll(gen, 'news', '/news', asNews, summary, (x) => x.latestNews);
      if (r.outcome === 'ok' && this.#live(gen)) {
        this.#put(gen, { news: r.items });
        this.#seen.news = r.last.latestNews;
      }
      if (!carryOn(r.outcome)) return;
    }
    if (!('repo' in this.#seen) || this.#seen.repo !== summary.repositoryAt) {
      const o = await this.#readRepository(gen);
      if (o === 'ok' && this.#live(gen)) this.#seen.repo = summary.repositoryAt;
      if (!carryOn(o)) return;
    }
    if (clean && this.#live(gen)) {
      this.#failures = 0;
      this.#put(gen, { lastError: null });
    }
  }

  #live(gen: number): boolean {
    return gen === this.#generation;
  }

  #put(gen: number, patch: Partial<AccountData>): void {
    if (this.#live(gen)) this.#data = { ...this.#data, ...patch };
  }

  async #refreshConfig(gen: number): Promise<void> {
    if (this.#configLoaded || this.#opts.now() < this.#configRetryAt) return;
    const config = await this.#opts.loadConfig();
    if (config === undefined) {
      this.#configRetryAt = this.#opts.now() + CONFIG_RETRY_MS;
      return;
    }
    this.#configLoaded = true;
    this.#put(gen, { config });
  }

  #failed(gen: number, what: string, r: CallError): Outcome {
    if (!this.#live(gen)) return 'hard';
    this.#data = { ...this.#data, lastError: { what, status: r.status, code: r.code, requestId: r.requestId } };
    if (r.status === 429) {
      this.#blockedUntil = this.#opts.now() + (r.retryAfter ?? 60) * 1000;
      return 'hard';
    }
    if (r.status === 0 || r.status >= 500) {
      this.#blockedUntil = this.#opts.now() + backoffMs(this.#failures, this.#opts.rand);
      this.#failures += 1;
      return 'hard';
    }
    return 'soft';
  }

  #badBody(gen: number, what: string, status: number): Outcome {
    this.#failed(gen, what, { ok: false, status, code: 'bad-body', requestId: null, retryAfter: null });
    return 'soft';
  }

  async #readSummary(gen: number): Promise<Summary | null> {
    const r = await this.#opts.call('GET', '/me/summary');
    if (!r.ok) {
      this.#failed(gen, 'summary', r);
      return null;
    }
    const s = asSummary(r.data);
    if (!s) this.#badBody(gen, 'summary', r.status);
    return s;
  }

  async #readAll<T extends { id: string }>(
    gen: number, what: string, path: string, item: (v: unknown) => T | null,
    start: Summary, watch: (s: Summary) => unknown,
  ): Promise<Scroll<T>> {
    let before = start;
    for (let attempt = 0; ; attempt += 1) {
      const byId = new Map<string, T>();
      let offset: number | null = 0;
      for (let page = 0; offset !== null && page < MAX_PAGES; page += 1) {
        const r = await this.#opts.call('GET', `${path}?limit=${PAGE}&offset=${offset}`);
        if (!r.ok) return { outcome: this.#failed(gen, what, r), items: [], last: before };
        const p = asPage(r.data, item);
        if (!p) return { outcome: this.#badBody(gen, what, r.status), items: [], last: before };
        for (const x of p.items) if (!byId.has(x.id)) byId.set(x.id, x);
        offset = p.nextOffset !== null && p.nextOffset > offset ? p.nextOffset : null;
      }
      if (attempt === MAX_RESTARTS) return { outcome: 'ok', items: [...byId.values()], last: before };
      const now = await this.#readSummary(gen);
      if (!now) return { outcome: 'hard', items: [], last: before };
      this.#put(gen, { summary: now });
      if (watch(now) === watch(before)) return { outcome: 'ok', items: [...byId.values()], last: now };
      before = now;
    }
  }

  async #readStages(gen: number): Promise<Outcome> {
    const r = await this.#opts.call('GET', '/stages');
    if (!r.ok) return this.#failed(gen, 'stages', r);
    const list = asStageList(r.data);
    if (!list) return this.#badBody(gen, 'stages', r.status);
    for (const s of list) {
      const cached = this.#stages.get(s.id);
      if (cached && cached.errataAt === s.errataAt) {
        if (cached.acknowledgedAt !== s.acknowledgedAt && this.#live(gen)) {
          this.#stages.set(s.id, { ...cached, acknowledgedAt: s.acknowledgedAt });
        }
        continue;
      }
      const full = await this.#opts.call('GET', `/stages/${s.id}`);
      if (!full.ok && full.status === 404) continue;
      if (!full.ok) return this.#failed(gen, 'stage', full);
      const stage = asStage(field(full.data, 'stage'));
      if (!stage) return this.#badBody(gen, 'stage', full.status);
      if (!this.#live(gen)) return 'hard';
      this.#stages.set(stage.id, stage);
    }
    this.#put(gen, { stages: [...list].sort((a, b) => a.position - b.position) });
    return 'ok';
  }

  async #readRepository(gen: number): Promise<Outcome> {
    const r = await this.#opts.call('GET', '/me/repository');
    if (!r.ok) return this.#failed(gen, 'repository', r);
    const raw = field(r.data, 'repository');
    if (raw === null) {
      this.#put(gen, { repository: null });
      return 'ok';
    }
    const repository = asRepository(raw);
    if (!repository) return this.#badBody(gen, 'repository', r.status);
    this.#put(gen, { repository });
    return 'ok';
  }

  async ack(id: string): Promise<CallResult> {
    if (!isId(id)) return notFound;
    const r = await this.#opts.call('POST', `/stages/${id}/ack`);
    if (!r.ok) return r;
    const s = asStage(field(r.data, 'stage'));
    if (s) {
      this.#stages.set(s.id, s);
      this.#data = {
        ...this.#data,
        stages: this.#data.stages.map((x) => (x.id === s.id ? { ...x, acknowledgedAt: s.acknowledgedAt } : x)),
      };
    }
    return r;
  }

  async markRead(id: string): Promise<CallResult> {
    if (!isId(id)) return notFound;
    const r = await this.#opts.call('POST', `/inbox/${id}/read`);
    if (!r.ok) return r;
    const m = asMessage(field(r.data, 'message'));
    if (m) this.#data = { ...this.#data, inbox: this.#data.inbox.map((x) => (x.id === m.id ? m : x)) };
    return r;
  }
}
