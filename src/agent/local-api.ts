import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { EtherState } from '../protocol/ether.ts';
import type { Application } from './store.ts';
import type { RegistrarPhase } from './registrar.ts';
import { isRepositoryRoot } from './repository-url.ts';
import { readClientFile } from './static-files.ts';
import type { AccountData } from './mailroom.ts';
import type { SessionState } from './session.ts';
import type { CallResult } from './server.ts';
import { isId } from './account.ts';

export type AccountView = AccountData & {
  session: { state: SessionState; expiresAt: string | null; username: string | null; displayName: string | null };
};

export type ActionReply =
  | ({ ok: true } & Record<string, unknown>)
  | { ok: false; status: number; code: string | null; requestId: string | null; retryAfter: number | null };

export type AccountHandlers = {
  stage(id: string): unknown;
  ack(id: string): Promise<ActionReply>;
  read(id: string): Promise<ActionReply>;
  login(): Promise<ActionReply>;
  logout(): Promise<ActionReply>;
  roll(): Promise<ActionReply>;
};

export type AccountRoute =
  | { kind: 'stage' | 'ack' | 'read'; id: string }
  | { kind: 'login' | 'logout' | 'roll' };

export type Snapshot = {
  ether: EtherState;
  registrar: RegistrarPhase;
  blockedReason: string | null;
  serverNow: number | null;
  msUntilOpen: number | null;
  account?: AccountView;
};

export type LocalApiOptions = {
  port: number;
  clientDir?: string;
  snapshot: () => Snapshot;
  onApplication: (a: Application) => Promise<void>;
  onInvitation: (code: string) => Promise<void>;
  account?: AccountHandlers;
  pushMs?: number;
};

const MAX_BODY = 64 * 1024;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    const collect = (c: string): void => {
      body += c;
      if (body.length > MAX_BODY) {
        req.off('data', collect);
        req.resume();
        reject(new Error('body too large'));
      }
    };
    req.on('data', collect);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export function callReply(r: CallResult, extra: Record<string, unknown>): ActionReply {
  return r.ok
    ? { ok: true, ...extra }
    : { ok: false, status: r.status, code: r.code, requestId: r.requestId, retryAfter: r.retryAfter };
}

export function accountRoute(method: string, url: string): AccountRoute | null {
  const parts = url.split('/');
  if (parts[0] !== '' || parts[1] !== 'account') return null;
  const [, , a, id, action] = parts;
  if (method === 'GET' && a === 'stages' && isId(id) && parts.length === 4) return { kind: 'stage', id };
  if (method !== 'POST') return null;
  if (a === 'stages' && isId(id) && action === 'ack' && parts.length === 5) return { kind: 'ack', id };
  if (a === 'inbox' && isId(id) && action === 'read' && parts.length === 5) return { kind: 'read', id };
  if (parts.length === 3 && (a === 'login' || a === 'logout' || a === 'roll')) return { kind: a };
  return null;
}

const USERNAME_RE = /^[a-z][a-z0-9_-]{2,31}$/;
const LANGS = new Set(['uk', 'en']);

type ApplicationField = keyof Application;

function validateApplication(v: unknown): { ok: true; value: Application } | { ok: false; field: ApplicationField | 'body' } {
  if (typeof v !== 'object' || v === null) return { ok: false, field: 'body' };
  const a = v as Record<string, unknown>;

  if (typeof a.username !== 'string' || !USERNAME_RE.test(a.username)) {
    return { ok: false, field: 'username' };
  }
  if (
    typeof a.displayName !== 'string'
    || a.displayName.length < 1 || a.displayName.length > 80
    || a.displayName !== a.displayName.trim()
  ) {
    return { ok: false, field: 'displayName' };
  }
  if (typeof a.password !== 'string' || a.password.length < 12 || a.password.length > 256) {
    return { ok: false, field: 'password' };
  }
  if (typeof a.invitation !== 'string' || a.invitation.length > 100) {
    return { ok: false, field: 'invitation' };
  }
  if (
    typeof a.repositoryUrl !== 'string'
    || a.repositoryUrl.length === 0 || a.repositoryUrl.length > 256
    || !isRepositoryRoot(a.repositoryUrl)
  ) {
    return { ok: false, field: 'repositoryUrl' };
  }
  if (typeof a.lang !== 'string' || !LANGS.has(a.lang)) {
    return { ok: false, field: 'lang' };
  }

  return {
    ok: true,
    value: {
      username: a.username,
      displayName: a.displayName,
      password: a.password,
      invitation: a.invitation,
      repositoryUrl: a.repositoryUrl,
      lang: a.lang as Application['lang'],
    },
  };
}

export async function startLocalApi(opts: LocalApiOptions): Promise<{ port: number; close(): Promise<void> }> {
  const pushMs = opts.pushMs ?? 1000;
  const streams = new Set<ServerResponse>();

  const server = createServer((req, res) => {
    const send = (status: number, body?: unknown): void => {
      if (body === undefined) { res.writeHead(status); res.end(); return; }
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    void (async () => {
      try {
        const port = req.socket.localPort;
        if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) {
          send(403, { error: 'foreign host' });
          return;
        }
        if (req.method === 'POST' && !(req.headers['content-type'] ?? '').startsWith('application/json')) {
          send(415, { error: 'content-type must be application/json' });
          return;
        }
        const route = opts.account ? accountRoute(req.method ?? '', req.url ?? '') : null;
        if (route && opts.account) {
          const acc = opts.account;
          if (route.kind === 'stage') {
            const stage = acc.stage(route.id);
            if (stage) send(200, { stage });
            else send(404, { error: 'not found' });
            return;
          }
          await readBody(req);
          const reply = route.kind === 'ack' ? await acc.ack(route.id)
            : route.kind === 'read' ? await acc.read(route.id)
            : route.kind === 'login' ? await acc.login()
            : route.kind === 'logout' ? await acc.logout()
            : await acc.roll();
          send(200, reply);
          return;
        }
        if (req.method === 'GET' && req.url === '/state') {
          send(200, opts.snapshot());
          return;
        }
        if (req.method === 'GET' && req.url === '/events') {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-store',
            connection: 'keep-alive',
          });
          res.write(`data: ${JSON.stringify(opts.snapshot())}\n\n`);
          streams.add(res);
          req.on('close', () => streams.delete(res));
          return;
        }
        if (req.method === 'POST' && req.url === '/application') {
          const parsed: unknown = JSON.parse(await readBody(req));
          const result = validateApplication(parsed);
          if (!result.ok) {
            send(400, { error: `invalid ${result.field}`, field: result.field });
            return;
          }
          await opts.onApplication(result.value);
          send(204);
          return;
        }
        if (req.method === 'POST' && req.url === '/invitation') {
          const parsed = JSON.parse(await readBody(req)) as { invitation?: unknown };
          if (typeof parsed.invitation !== 'string' || parsed.invitation.length === 0) {
            send(400, { error: 'invitation must be a non-empty string' });
            return;
          }
          await opts.onInvitation(parsed.invitation);
          send(204);
          return;
        }
        if (req.method === 'GET' && opts.clientDir) {
          const file = await readClientFile(opts.clientDir, req.url ?? '/');
          if (file) {
            res.writeHead(200, { 'content-type': file.type, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
            res.end(file.body);
            return;
          }
        }
        send(404, { error: 'not found' });
      } catch (err) {
        if (res.headersSent) res.end();
        else send(400, { error: err instanceof Error ? err.message : 'bad request' });
      }
    })().catch((err: unknown) => {
      console.error('local API request failed:', err instanceof Error ? err.message : err);
    });
  });

  await new Promise<void>((r) => server.listen(opts.port, '127.0.0.1', () => r()));

  const timer = setInterval(() => {
    try {
      const payload = `data: ${JSON.stringify(opts.snapshot())}\n\n`;
      for (const res of streams) res.write(payload);
    } catch (err) {
      console.error('SSE push failed:', err instanceof Error ? err.message : err);
    }
  }, pushMs);
  timer.unref();

  const addr = server.address();
  return {
    port: typeof addr === 'object' && addr ? addr.port : opts.port,
    close: () => new Promise((done) => {
      clearInterval(timer);
      for (const res of streams) res.end();
      server.close(() => done());
    }),
  };
}
