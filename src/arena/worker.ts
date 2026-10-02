import { Session } from '../../bot/arena/session.ts';
import { rivalNames } from '../../bot/arena/roster.ts';
import { Loop } from './loop.ts';
import type { FromWorker, ToWorker } from './protocol.ts';

const post = (m: FromWorker): void => self.postMessage(m);
const loop = new Loop(post, (fn, ms) => setTimeout(fn, ms), (h) => clearTimeout(h as number), (o) => new Session(o));
post({ kind: 'names', names: rivalNames() });
self.onmessage = (e: MessageEvent<ToWorker>) => {
  try {
    loop.handle(e.data);
  } catch (err) {
    post({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
