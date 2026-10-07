import { TruthQueue } from './model/queue.ts';
import type { ToTruth } from './model/queue.ts';

const queue = new TruthQueue((m) => self.postMessage(m), (fn) => setTimeout(fn, 0));
self.onmessage = (e: MessageEvent<ToTruth>) => queue.handle(e.data);
