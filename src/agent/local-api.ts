import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { EtherState } from '../protocol/ether.ts';
import type { Application } from './store.ts';
import type { RegistrarPhase } from './registrar.ts';

export type Snapshot = {
  ether: EtherState;
  registrar: RegistrarPhase;
  blockedReason: string | null;
  serverNow: number | null;
  msUntilOpen: number | null;
};

export type LocalApiOptions = {
  port: number;
  snapshot: () => Snapshot;
  onApplication: (a: Application) => Promise<void>;
  onInvitation: (code: string) => Promise<void>;
  pushMs?: number;
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => resolve(body));
  });
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
          const parsed = JSON.parse(await readBody(req)) as Application;
          await opts.onApplication(parsed);
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
        send(404, { error: 'not found' });
      } catch (err) {
        send(400, { error: err instanceof Error ? err.message : 'bad request' });
      }
    })();
  });

  await new Promise<void>((r) => server.listen(opts.port, '127.0.0.1', () => r()));

  const timer = setInterval(() => {
    const payload = `data: ${JSON.stringify(opts.snapshot())}\n\n`;
    for (const res of streams) res.write(payload);
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
