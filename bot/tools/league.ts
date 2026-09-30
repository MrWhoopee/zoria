import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { parseArgs } from 'node:util';
import { Worker } from 'node:worker_threads';
import { PRESETS } from '../src/preset.ts';
import { jobs, pending, trios } from './league/jobs.ts';
import type { Job } from './league/jobs.ts';
import { ARCHETYPE_NAMES, kindOf } from './league/roster.ts';
import { readRecords, report } from './league/report.ts';
import type { PackRecord } from './league/table.ts';
import type { WorkerJob, WorkerReply } from './league/worker.ts';

const { values } = parseArgs({
  options: {
    players: { type: 'string', default: Object.keys(PRESETS).join(',') },
    pool: { type: 'string', default: ARCHETYPE_NAMES.join(',') },
    seeds: { type: 'string', default: '4' },
    from: { type: 'string', default: '100' },
    ticks: { type: 'string', default: '1200' },
    resume: { type: 'string', default: '' },
    workers: { type: 'string', default: String(Math.max(1, Math.floor(cpus().length / 2) - 2)) },
  },
});

const list = (s: string): string[] => s.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
const players = list(values.players);
const pool = list(values.pool);
for (const n of [...players, ...pool]) kindOf(n);
const seeds = Array.from({ length: Number(values.seeds) }, (_, i) => Number(values.from) + i);
const ticks = Number(values.ticks);
const earlier: PackRecord[] = values.resume && existsSync(values.resume) ? readRecords(readFileSync(values.resume, 'utf8')) : [];
const todo: Job[] = pending(jobs(trios(players, pool), seeds), earlier);
for (const [name, raw] of [['seeds', values.seeds], ['from', values.from], ['ticks', values.ticks], ['workers', values.workers]] as const) {
  if (!Number.isInteger(Number(raw)) || Number(raw) < 0) throw new Error('--' + name + ' must be a whole number, got ' + raw);
}
const width = Math.min(Math.max(1, Number(values.workers)), todo.length);
const log = (line: string): void => {
  process.stdout.write(line + '\n');
};

mkdirSync('league', { recursive: true });
const file = values.resume || 'league/' + new Date().toISOString().replace(/[:.]/g, '-') + '.ndjson';
if (!values.resume) writeFileSync(file, '');
log('ліга: ' + todo.length + ' пакетів (уже зіграно ' + earlier.length + '), ' + width + ' працівників, тактів ' + ticks + ', записи: ' + file);

function runAll(): Promise<PackRecord[]> {
  return new Promise((done) => {
    const records: PackRecord[] = [...earlier];
    if (todo.length === 0) {
      done(records);
      return;
    }
    let next = 0;
    let finished = 0;
    let failed = 0;
    const started = Date.now();
    const settle = (): void => {
      finished++;
      if (finished % Math.max(1, Math.floor(todo.length / 10)) === 0) log('  ' + finished + '/' + todo.length + ', ' + Math.round((Date.now() - started) / 1000) + ' с');
      if (finished === todo.length) {
        if (failed > 0) log('збоїв: ' + failed);
        done(records);
      }
    };
    const spawn = (): void => {
      const w = new Worker(new URL('./league/worker.ts', import.meta.url));
      let current: Job | null = null;
      const feed = (): void => {
        const job = todo[next++];
        if (!job) {
          current = null;
          w.terminate().catch((e: unknown) => log('працівник не зупинився: ' + String(e)));
          return;
        }
        current = job;
        const msg: WorkerJob = { job, ticks };
        w.postMessage(msg);
      };
      w.on('message', (reply: WorkerReply) => {
        current = null;
        if (reply.ok) {
          records.push(reply.record);
          appendFileSync(file, JSON.stringify(reply.record) + '\n');
        } else {
          failed++;
          log('збій: ' + reply.job.cast.join(',') + ' жереб ' + reply.job.seed + ': ' + reply.error);
        }
        settle();
        feed();
      });
      w.on('error', (e) => {
        log('працівник упав: ' + e.message);
      });
      w.on('exit', () => {
        if (current === null) return;
        failed++;
        log('пакет втрачено: ' + current.cast.join(',') + ' жереб ' + current.seed);
        current = null;
        settle();
        if (next < todo.length) spawn();
      });
      feed();
    };
    for (let i = 0; i < width; i++) spawn();
  });
}

const records = await runAll();
log('');
for (const line of report(records, players)) log(line);
