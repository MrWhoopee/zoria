import { fetchRaw, type Failure } from './http.ts';
import { errorCode } from './wire.ts';
import { asConfigAccess, type RepoAccess } from './account.ts';
import type { RawResponse } from '../protocol/classify.ts';

export type CallError = { ok: false; status: number; code: string | null; requestId: string | null; retryAfter: number | null };
export type CallResult = { ok: true; status: number; data: unknown } | CallError;
export type Caller = (method: 'GET' | 'POST', path: string) => Promise<CallResult>;
export type TokenSource = { token(): Promise<string | null>; renew(stale: string): Promise<string | null> };

export type CallerOptions = { api: string; session: TokenSource; timeoutMs: number; now?: () => number };

const failure = (status: number, code: string | null, requestId: string | null = null, retryAfter: number | null = null): CallError =>
  ({ ok: false, status, code, requestId, retryAfter });

function toResult(res: RawResponse | Failure): CallResult {
  if ('failed' in res) return failure(0, res.failed);
  const requestId = res.requestId ?? null;
  if (res.status >= 200 && res.status < 300) {
    if (res.body === '') return { ok: true, status: res.status, data: null };
    try {
      return { ok: true, status: res.status, data: JSON.parse(res.body) as unknown };
    } catch {
      return failure(res.status, 'bad-body', requestId);
    }
  }
  return failure(res.status, errorCode(res.body), requestId, res.retryAfterSeconds);
}

export function makeCaller(o: CallerOptions): Caller {
  const send = (method: 'GET' | 'POST', path: string, token: string): Promise<RawResponse | Failure> =>
    fetchRaw(`${o.api}${path}`, {
      method,
      headers: method === 'POST'
        ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
        : { authorization: `Bearer ${token}` },
      body: method === 'POST' ? '{}' : undefined,
    }, o.timeoutMs, o.now);

  return async (method, path) => {
    const token = await o.session.token();
    if (token === null) return failure(0, 'no-session');
    const first = await send(method, path, token);
    if ('failed' in first || first.status !== 401) return toResult(first);
    const fresh = await o.session.renew(token);
    if (fresh === null) return toResult(first);
    return toResult(await send(method, path, fresh));
  };
}

export async function fetchRepoAccess(api: string, timeoutMs: number): Promise<RepoAccess | null | undefined> {
  const res = await fetchRaw(`${api}/public/config`, {}, timeoutMs);
  if ('failed' in res || res.status !== 200) return undefined;
  try {
    return asConfigAccess(JSON.parse(res.body) as unknown);
  } catch {
    return undefined;
  }
}
