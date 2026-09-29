import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

export interface HeadStats {
  ticks: number;
  orders: number;
  nacks: number;
  bytesIn: number;
  bytesOut: number;
  resyncMs: number;
  resumes: number;
  faults: number;
  deferred: number;
  lastTickAt: number;
}

export interface HeadState {
  state: 'lobby' | 'live' | 'done';
  slot: string | null;
  preset: string;
  presets: string[];
  freeze: boolean;
  tick: number;
  frames: number;
  ticks: number;
  why: string;
  engine: string;
  uptimeMs: number;
  stats: HeadStats;
  belief: { frames: number; ageMs: number };
}

export interface Head {
  state(): HeadState;
  promote(preset: unknown): string;
}

export class Refusal extends Error {
  readonly code: number;

  constructor(code: number, word: string) {
    super(word);
    this.code = code;
    this.name = 'Refusal';
  }
}

const LIMIT = 1024;

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((ok, bad) => {
    const chunks: Buffer[] = [];
    let n = 0;
    req.on('data', (c: Buffer) => {
      n += c.length;
      if (n > LIMIT) {
        bad(new Refusal(400, 'json'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const v: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('json');
        ok(v as Record<string, unknown>);
      } catch {
        bad(new Refusal(400, 'json'));
      }
    });
    req.on('error', bad);
  });
}

function send(res: ServerResponse, code: number, value: unknown): void {
  const text = JSON.stringify(value);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

async function route(head: Head, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url ?? '/').split('?')[0];
  try {
    if (req.method === 'GET' && path === '/state') send(res, 200, head.state());
    else if (req.method === 'POST' && path === '/preset') send(res, 200, { preset: head.promote((await readBody(req))['preset']) });
    else send(res, 404, { error: 'path' });
  } catch (e) {
    if (e instanceof Refusal) send(res, e.code, { error: e.message });
    else send(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
}

export function statusServer(head: Head): Server {
  return createServer((req, res) => {
    void route(head, req, res);
  });
}
