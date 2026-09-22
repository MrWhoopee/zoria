import { createServer, type Server } from 'node:http';
import { FRAME_A, FRAME_B, FRAME_C_TEXT, LEARNING_KEY_ID } from '../fixtures/frames.ts';

export type NoiseStep =
  | { kind: 'signal'; frame?: string; seal?: string; status?: number }
  | { kind: 'forgery' }
  | { kind: 'broken' }
  | { kind: 'foreign'; status?: number; body?: string }
  | { kind: 'stopping'; retryAfter?: number }
  | { kind: 'jammed'; retryAfter?: number }
  | { kind: 'hang' }
  | { kind: 'partial' }
  | { kind: 'delay'; ms?: number };

export type NoiseServer = {
  url: string;
  setScript(script: NoiseStep[]): void;
  requestCount(): number;
  close(): Promise<void>;
};

const FOREIGN_STATUSES = [200, 201, 204, 400, 401, 403, 404, 409, 410, 418, 422, 500, 502, 504];

export function startNoiseServer(initial: NoiseStep[] = [{ kind: 'signal' }]): Promise<NoiseServer> {
  let script = initial;
  let i = 0;
  let count = 0;

  const server: Server = createServer((req, res) => {
    count += 1;
    const step = script[i % script.length];
    i += 1;

    const json = (status: number, body: string, headers: Record<string, string> = {}): void => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(body);
    };

    switch (step.kind) {
      case 'signal': {
        const envelope = JSON.stringify({
          frame: step.frame ?? FRAME_A.frame,
          seal: step.seal ?? FRAME_A.seal,
          key: LEARNING_KEY_ID,
        });
        json(step.status ?? 200, envelope);
        return;
      }
      case 'forgery':
        json(200, JSON.stringify({ frame: FRAME_B.frame, seal: FRAME_B.seal, key: LEARNING_KEY_ID }));
        return;
      case 'broken':
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(FRAME_C_TEXT);
        return;
      case 'foreign': {
        const status = step.status ?? FOREIGN_STATUSES[count % FOREIGN_STATUSES.length];
        json(status, step.body ?? JSON.stringify({ error: { code: 'username-unavailable' } }));
        return;
      }
      case 'stopping':
        json(503, JSON.stringify({ error: { code: 'stopping' } }),
          { 'retry-after': String(step.retryAfter ?? 30) });
        return;
      case 'jammed':
        json(429, JSON.stringify({ error: { code: 'jammed' } }),
          { 'retry-after': String(step.retryAfter ?? 30) });
        return;
      case 'hang':
        req.socket.destroy();
        return;
      case 'partial': {
        const envelope = JSON.stringify({
          frame: FRAME_A.frame,
          seal: FRAME_A.seal,
          key: LEARNING_KEY_ID,
        });
        res.writeHead(200, {
          'content-type': 'application/json',
          'content-length': String(envelope.length),
        });
        res.write(envelope.slice(0, Math.floor(envelope.length / 2)));
        req.socket.destroy();
        return;
      }
      case 'delay': {
        const envelope = JSON.stringify({
          frame: FRAME_A.frame,
          seal: FRAME_A.seal,
          key: LEARNING_KEY_ID,
        });
        const delayMs = step.ms ?? 2000;
        const timer = setTimeout(() => {
          json(200, envelope);
        }, delayMs);
        res.on('close', () => clearTimeout(timer));
        return;
      }
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        setScript: (s) => { script = s; i = 0; },
        requestCount: () => count,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
