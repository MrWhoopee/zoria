import { createServer, type Server } from 'node:http';

export type Reply = { status: number; body: string; retryAfter?: number; requestId?: string };
export type Route = (body: string, auth: string | null) => Reply | 'hang' | Promise<Reply | 'hang'>;
export type Seen = { method: string; path: string; auth: string | null; body: string };
export type FakeApi = { url: string; server: Server; hits: string[]; seen: Seen[] };

export async function fakeApi(routes: Record<string, Route[]>): Promise<FakeApi> {
  const hits: string[] = [];
  const seen: Seen[] = [];
  const taken: Record<string, number> = {};
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const path = req.url ?? '';
      const auth = req.headers.authorization ?? null;
      hits.push(path);
      seen.push({ method: req.method ?? '', path, auth, body });
      const list = routes[path] ?? [];
      const idx = Math.min(taken[path] ?? 0, list.length - 1);
      taken[path] = (taken[path] ?? 0) + 1;
      void Promise.resolve(list[idx]?.(body, auth)).then((out) => {
      if (!out || out === 'hang') { req.socket.destroy(); return; }
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (out.retryAfter !== undefined) headers['retry-after'] = String(out.retryAfter);
      if (out.requestId !== undefined) headers['x-request-id'] = out.requestId;
      res.writeHead(out.status, headers);
      res.end(out.body);
      });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { url: `http://127.0.0.1:${port}`, server, hits, seen };
}
