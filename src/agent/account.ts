export type Summary = {
  unread: number;
  releasedStages: number;
  acknowledgedStages: number;
  latestNews: string | null;
  repositoryAt: string | null;
  serverTime: string | null;
};

export type Repository = {
  url: string;
  accessStatus: string;
  checkedAt: string | null;
  reason: string | null;
  reasonCode: string | null;
  updatedAt: string | null;
  verifiedElsewhere: boolean;
};

export type RepoAccess = { githubUsername: string; permission: string; instructions: string };

export type News = {
  id: string;
  title: string;
  body: string;
  publishedAt: string | null;
  updatedAt: string | null;
  archivedAt: string | null;
};

export type Notice = { type: string } & Record<string, unknown>;

export type Message = {
  id: string;
  kind: string;
  stageId: string | null;
  title: string;
  body: string;
  createdAt: string | null;
  readAt: string | null;
  notice: Notice | null;
};

export type StageSummary = {
  id: string;
  position: number;
  title: string;
  excerpt: string;
  publishedAt: string | null;
  releasedAt: string | null;
  acknowledgedAt: string | null;
  errataAt: string | null;
};

export type Stage = Omit<StageSummary, 'excerpt'> & { body: string; errata: string | null };

type Obj = Record<string, unknown>;

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

function obj(v: unknown): Obj | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Obj : null;
}

const text = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const maybe = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);

export function isId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v);
}

export function field(v: unknown, key: string): unknown {
  return obj(v)?.[key];
}

export function asSummary(v: unknown): Summary | null {
  const o = obj(v);
  if (!o) return null;
  const unread = count(o.unread);
  const releasedStages = count(o.releasedStages);
  if (unread === null || releasedStages === null) return null;
  return {
    unread,
    releasedStages,
    acknowledgedStages: count(o.acknowledgedStages) ?? 0,
    latestNews: maybe(o.latestNews),
    repositoryAt: maybe(o.repositoryAt),
    serverTime: maybe(o.serverTime),
  };
}

export function asRepository(v: unknown): Repository | null {
  const o = obj(v);
  if (!o || typeof o.url !== 'string' || typeof o.accessStatus !== 'string') return null;
  return {
    url: o.url,
    accessStatus: o.accessStatus,
    checkedAt: maybe(o.checkedAt),
    reason: maybe(o.reason),
    reasonCode: maybe(o.reasonCode),
    updatedAt: maybe(o.updatedAt),
    verifiedElsewhere: o.verifiedElsewhere === true,
  };
}

export function asConfigAccess(v: unknown): RepoAccess | null | undefined {
  const o = obj(v);
  if (!o || !('repositoryAccess' in o)) return undefined;
  if (o.repositoryAccess === null) return null;
  const a = obj(o.repositoryAccess);
  if (!a || typeof a.githubUsername !== 'string') return undefined;
  return { githubUsername: a.githubUsername, permission: text(a.permission), instructions: text(a.instructions) };
}

export function asNews(v: unknown): News | null {
  const o = obj(v);
  if (!o || !isId(o.id)) return null;
  return {
    id: o.id,
    title: text(o.title),
    body: text(o.body),
    publishedAt: maybe(o.publishedAt),
    updatedAt: maybe(o.updatedAt),
    archivedAt: maybe(o.archivedAt),
  };
}

export function asMessage(v: unknown): Message | null {
  const o = obj(v);
  if (!o || !isId(o.id)) return null;
  const n = obj(o.notice);
  return {
    id: o.id,
    kind: text(o.kind, 'message'),
    stageId: isId(o.stageId) ? o.stageId : null,
    title: text(o.title),
    body: text(o.body),
    createdAt: maybe(o.createdAt),
    readAt: maybe(o.readAt),
    notice: n && typeof n.type === 'string' ? { ...n, type: n.type } : null,
  };
}

export function asStageSummary(v: unknown): StageSummary | null {
  const o = obj(v);
  const position = count(o?.position);
  if (!o || !isId(o.id) || position === null) return null;
  return {
    id: o.id,
    position,
    title: text(o.title),
    excerpt: text(o.excerpt),
    publishedAt: maybe(o.publishedAt),
    releasedAt: maybe(o.releasedAt),
    acknowledgedAt: maybe(o.acknowledgedAt),
    errataAt: maybe(o.errataAt),
  };
}

export function asStage(v: unknown): Stage | null {
  const s = asStageSummary(v);
  const o = obj(v);
  if (!s || !o) return null;
  const { excerpt: _excerpt, ...rest } = s;
  return { ...rest, body: text(o.body), errata: maybe(o.errata) };
}

export function asPage<T>(v: unknown, item: (x: unknown) => T | null): { items: T[]; nextOffset: number | null } | null {
  const o = obj(v);
  if (!o || !Array.isArray(o.items)) return null;
  const items = o.items.map(item).filter((x): x is T => x !== null);
  return { items, nextOffset: count(o.nextOffset) };
}

export function asStageList(v: unknown): StageSummary[] | null {
  const o = obj(v);
  if (!o || !Array.isArray(o.items)) return null;
  return o.items.map(asStageSummary).filter((x): x is StageSummary => x !== null);
}
