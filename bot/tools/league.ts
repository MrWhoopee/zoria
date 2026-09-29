import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { parseArgs } from 'node:util';
import { Worker } from 'node:worker_threads';
import { PRESETS } from '../src/preset.ts';
import { jobs, trios } from './league/jobs.ts';
import type { Job } from './league/jobs.ts';
import { ARCHETYPE_NAMES, kindOf } from './league/roster.ts';
import { headToHead, standings, worst } from './league/table.ts';
import type { PackRecord } from './league/table.ts';
import type { WorkerJob, WorkerReply } from './league/worker.ts';

const { values } = parseArgs({
  options: {
    players: { type: 'string', default: Object.keys(PRESETS).join(',') },
    pool: { type: 'string', default: ARCHETYPE_NAMES.join(',') },
    seeds: { type: 'string', default: '4' },
    from: { type: 'string', default: '100' },
    ticks: { type: 'string', default: '1200' },
    workers: { type: 'string', default: String(Math.max(1, cpus().length - 2)) },
  },
});

const list = (s: string): string[] => s.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
const players = list(values.players);
const pool = list(values.pool);
for (const n of [...players, ...pool]) kindOf(n);
const seeds = Array.from({ length: Number(values.seeds) }, (_, i) => Number(values.from) + i);
const ticks = Number(values.ticks);
const todo: Job[] = jobs(trios(players, pool), seeds);
const width = Math.min(Number(values.workers), todo.length);
const log = (line: string): void => {
  process.stdout.write(line + '\n');
};

log('ліга: ' + todo.length + ' пакетів, ' + width + ' працівників, тактів ' + ticks);

function runAll(): Promise<PackRecord[]> {
  return new Promise((done) => {
    const records: PackRecord[] = [];
    let next = 0;
    let finished = 0;
    let failed = 0;
    const started = Date.now();
    const feed = (w: Worker): void => {
      const job = todo[next++];
      if (!job) {
        void w.terminate();
        return;
      }
      const msg: WorkerJob = { job, ticks };
      w.postMessage(msg);
    };
    for (let i = 0; i < width; i++) {
      const w = new Worker(new URL('./league/worker.ts', import.meta.url));
      w.on('message', (reply: WorkerReply) => {
        finished++;
        if (reply.ok) records.push(reply.record);
        else {
          failed++;
          log('збій: ' + reply.job.cast.join(',') + ' жереб ' + reply.job.seed + ': ' + reply.error);
        }
        if (finished % Math.max(1, Math.floor(todo.length / 10)) === 0) log('  ' + finished + '/' + todo.length + ', ' + Math.round((Date.now() - started) / 1000) + ' с');
        if (finished === todo.length) {
          if (failed > 0) log('збоїв: ' + failed);
          done(records);
        }
        feed(w);
      });
      w.on('error', (e) => {
        log('працівник упав: ' + e.message);
      });
      feed(w);
    }
  });
}

const pad = (s: string | number, n: number): string => String(s).padStart(n);
const fix = (x: number): string => x.toFixed(1);

const records = await runAll();
const st = standings(records);
log('');
log('учасник'.padEnd(34) + pad('пакетів', 8) + pad('частка/9', 9) + pad('перших', 8) + pad('мережа', 8) + pad('замовл', 8) + pad('вкрадено', 9) + pad('завад', 7) + pad('таранів', 8));
for (const s of st) {
  log((s.name + ' [' + kindOf(s.name) + ']').padEnd(34) + pad(s.packs, 8) + pad(s.mean.toFixed(2), 9) + pad(Math.round((100 * s.firsts) / s.packs) + '%', 8) + pad(fix(s.network), 8) + pad(fix(s.orders), 8) + pad(fix(s.stolen), 9) + pad(fix(s.jams), 7) + pad(fix(s.rams), 8));
}
const names = st.map((s) => s.name);
for (const p of players) {
  log('');
  log(p + ' проти кожного (середня різниця часток за пакет):');
  for (const n of names) {
    if (n === p) continue;
    const h = headToHead(records, p, n);
    if (h.packs > 0) log('  ' + n.padEnd(32) + pad((h.diff >= 0 ? '+' : '') + h.diff.toFixed(2), 7) + pad('(' + h.packs + ')', 6));
  }
  log('  найгірші пакети:');
  for (const r of worst(records, p, 3)) log('    жереб ' + r.seed + ' ' + r.cast.join(', ') + ' -> ' + r.shares.join('/'));
}
mkdirSync('league', { recursive: true });
const file = 'league/' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
writeFileSync(file, JSON.stringify({ players, pool, seeds, ticks, records }, null, 1));
log('');
log('записано: ' + file);
