import { parentPort } from 'node:worker_threads';
import { createEngine } from '@zoria/engine';
import { runPack } from '@zoria/sdk';
import type { Job } from './jobs.ts';
import { seatOf } from './roster.ts';
import type { Breakdown, PackRecord } from './table.ts';

const ROT = [
  ['A', 'B', 'C'],
  ['B', 'C', 'A'],
  ['C', 'A', 'B'],
] as const;

export interface WorkerJob {
  job: Job;
  ticks: number;
}

export type WorkerReply = { ok: true; record: PackRecord } | { ok: false; job: Job; error: string };

function play({ job, ticks }: WorkerJob): PackRecord {
  const [a, b, c] = job.cast;
  const pack = runPack(createEngine, { seed: job.seed, ticks, cast: [seatOf(a), seatOf(b), seatOf(c)] });
  const matches = pack.matches.map((m, k) => {
    const rot = ROT[k] ?? ROT[0];
    const breakdown: Breakdown[] = rot.map((slot) => {
      const x = m.breakdown[slot];
      return { network: x.network, orders: x.orders, stolen: x.stolen ?? 0, jams: x.jams, rams: x.rams, pactTax: x.pactTax ?? 0 };
    });
    return { score: rot.map((slot) => m.score[slot]), breakdown };
  });
  return { seed: job.seed, cast: job.cast, shares: pack.shares, matches };
}

const port = parentPort;
if (port) {
  port.on('message', (msg: WorkerJob) => {
    let reply: WorkerReply;
    try {
      reply = { ok: true, record: play(msg) };
    } catch (e) {
      reply = { ok: false, job: msg.job, error: e instanceof Error ? e.message : String(e) };
    }
    port.postMessage(reply);
  });
}
