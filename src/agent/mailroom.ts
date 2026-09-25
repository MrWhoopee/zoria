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
    await this.#refreshConfig();
    if (this.#opts.now() < this.#blockedUntil) return;

    const summary = await this.#readSummary();
    if (!summary) return;
    this.#data = { ...this.#data, summary };

    const stagesKey = `${summary.releasedStages}:${summary.acknowledgedStages}:${summary.unread}`;
    if (this.#seen.inbox !== summary.unread) {
      if (!(await this.#readInbox(summary))) return;
      this.#seen.inbox = summary.unread;
    }
    if (this.#seen.stages !== stagesKey) {
      if (!(await this.#readStages())) return;
      this.#seen.stages = stagesKey;
    }
    if (!('news' in this.#seen) || this.#seen.news !== summary.latestNews) {
      if (!(await this.#readNews(summary))) return;
      this.#seen.news = summary.latestNews;
    }
    if (!('repo' in this.#seen) || this.#seen.repo !== summary.repositoryAt) {
      if (!(await this.#readRepository())) return;
      this.#seen.repo = summary.repositoryAt;
    }
    this.#failures = 0;
    this.#data = { ...this.#data, lastError: null };
  }

  async #refreshConfig(): Promise<void> {
    if (this.#configLoaded || this.#opts.now() < this.#configRetryAt) return;
    const config = await this.#opts.loadConfig();
    if (config === undefined) {
      this.#configRetryAt = this.#opts.now() + CONFIG_RETRY_MS;
      return;
    }
    this.#configLoaded = true;
    this.#data = { ...this.#data, config };
  }

  #failed(what: string, r: CallError): false {
    this.#data = { ...this.#data, lastError: { what, status: r.status, code: r.code, requestId: r.requestId } };
    if (r.status === 429) {
      this.#blockedUntil = this.#opts.now() + (r.retryAfter ?? 60) * 1000;
    } else if (r.status === 0 || r.status >= 500) {
      this.#blockedUntil = this.#opts.now() + backoffMs(this.#failures, this.#opts.rand);
      this.#failures += 1;
    }
    return false;
  }

  #badBody(what: string, status: number): false {
    return this.#failed(what, { ok: false, status, code: 'bad-body', requestId: null, retryAfter: null });
  }

  async #readSummary(): Promise<Summary | null> {
    const r = await this.#opts.call('GET', '/me/summary');
    if (!r.ok) { this.#failed('summary', r); return null; }
    const s = asSummary(r.data);
    if (!s) { this.#badBody('summary', r.status); return null; }
    return s;
  }

  async #readAll<T extends { id: string }>(
    what: string, path: string, item: (v: unknown) => T | null, moved: (s: Summary) => boolean,
  ): Promise<T[] | null> {
    for (let attempt = 0; ; attempt += 1) {
      const byId = new Map<string, T>();
      let offset: number | null = 0;
      for (let page = 0; offset !== null && page < MAX_PAGES; page += 1) {
        const r = await this.#opts.call('GET', `${path}?limit=${PAGE}&offset=${offset}`);
        if (!r.ok) return this.#failed(what, r) || null;
        const p = asPage(r.data, item);
        if (!p) return this.#badBody(what, r.status) || null;
        for (const x of p.items) if (!byId.has(x.id)) byId.set(x.id, x);
        offset = p.nextOffset !== null && p.nextOffset > offset ? p.nextOffset : null;
      }
      if (attempt === MAX_RESTARTS) return [...byId.values()];
      const now = await this.#readSummary();
      if (!now) return null;
      this.#data = { ...this.#data, summary: now };
      if (!moved(now)) return [...byId.values()];
    }
  }

  async #readInbox(start: Summary): Promise<boolean> {
    const items = await this.#readAll('inbox', '/inbox', asMessage, (s) => s.unread !== start.unread);
    if (!items) return false;
    this.#data = { ...this.#data, inbox: items };
    return true;
  }

  async #readNews(start: Summary): Promise<boolean> {
    const items = await this.#readAll('news', '/news', asNews, (s) => s.latestNews !== start.latestNews);
    if (!items) return false;
    this.#data = { ...this.#data, news: items };
    return true;
  }

  async #readStages(): Promise<boolean> {
    const r = await this.#opts.call('GET', '/stages');
    if (!r.ok) return this.#failed('stages', r);
    const list = asStageList(r.data);
    if (!list) return this.#badBody('stages', r.status);
    for (const s of list) {
      const cached = this.#stages.get(s.id);
      if (cached && cached.errataAt === s.errataAt) {
        if (cached.acknowledgedAt !== s.acknowledgedAt) this.#stages.set(s.id, { ...cached, acknowledgedAt: s.acknowledgedAt });
        continue;
      }
      const full = await this.#opts.call('GET', `/stages/${s.id}`);
      if (!full.ok && full.status === 404) continue;
      if (!full.ok) return this.#failed('stage', full);
      const stage = asStage(field(full.data, 'stage'));
      if (!stage) return this.#badBody('stage', full.status);
      this.#stages.set(stage.id, stage);
    }
    this.#data = { ...this.#data, stages: [...list].sort((a, b) => a.position - b.position) };
    return true;
  }

  async #readRepository(): Promise<boolean> {
    const r = await this.#opts.call('GET', '/me/repository');
    if (!r.ok) return this.#failed('repository', r);
    const raw = field(r.data, 'repository');
    if (raw === null) {
      this.#data = { ...this.#data, repository: null };
      return true;
    }
    const repository = asRepository(raw);
    if (!repository) return this.#badBody('repository', r.status);
    this.#data = { ...this.#data, repository };
    return true;
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
