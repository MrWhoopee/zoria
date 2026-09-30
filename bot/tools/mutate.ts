import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { apply, mutants } from './mutate/ops.ts';
import type { Mutant } from './mutate/ops.ts';

const { values } = parseArgs({
  options: {
    files: { type: 'string', default: '' },
    workers: { type: 'string', default: '4' },
    every: { type: 'string', default: '1' },
    timeout: { type: 'string', default: '60' },
  },
});

const SKIP = new Set(['src/main.ts', 'src/status.ts']);
const root = process.cwd();
const log = (line: string): void => {
  process.stdout.write(line + '\n');
};

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    return d.isDirectory() ? sources(p) : d.name.endsWith('.ts') ? [relative(root, p).replace(/\\/g, '/')] : [];
  });
}

const wanted = values.files ? values.files.split(',') : sources('src').filter((f) => !SKIP.has(f));
const every = Math.max(1, Number(values.every));
interface Job {
  file: string;
  m: Mutant;
}
const jobs: Job[] = wanted.flatMap((file) => mutants(readFileSync(file, 'utf8')).map((m) => ({ file, m }))).filter((_, i) => i % every === 0);
const width = Math.max(1, Math.min(Number(values.workers), jobs.length));
const base = join(root, '.mutants');
rmSync(base, { recursive: true, force: true });
const copies = Array.from({ length: width }, (_, i) => {
  const dir = join(base, 'w' + i);
  mkdirSync(dir, { recursive: true });
  for (const part of ['src', 'test', 'tools', 'package.json', 'tsconfig.json']) cpSync(join(root, part), join(dir, part), { recursive: true });
  return dir;
});

function runTests(dir: string): Promise<boolean> {
  return new Promise((done) => {
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', 'test/**/*.test.ts'], { cwd: dir, stdio: 'ignore' });
    const timer = setTimeout(() => child.kill(), Number(values.timeout) * 1000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      done(code !== 0);
    });
    child.on('error', () => {
      clearTimeout(timer);
      done(true);
    });
  });
}

log('мутантів: ' + jobs.length + ', копій: ' + width);
const survivors: Job[] = [];
const perFile = new Map<string, { total: number; killed: number }>();
let next = 0;
let done = 0;
const started = Date.now();

async function worker(dir: string): Promise<void> {
  for (let job = jobs[next++]; job; job = jobs[next++]) {
    const target = join(dir, job.file);
    const original = readFileSync(join(root, job.file), 'utf8');
    writeFileSync(target, apply(original, job.m));
    const killed = await runTests(dir);
    writeFileSync(target, original);
    const s = perFile.get(job.file) ?? { total: 0, killed: 0 };
    s.total++;
    if (killed) s.killed++;
    else survivors.push(job);
    perFile.set(job.file, s);
    done++;
    if (done % Math.max(1, Math.floor(jobs.length / 10)) === 0) log('  ' + done + '/' + jobs.length + ', ' + Math.round((Date.now() - started) / 1000) + ' с');
  }
}

await Promise.all(copies.map((d) => worker(d)));
rmSync(base, { recursive: true, force: true });
let total = 0;
let killed = 0;
log('');
for (const [file, s] of [...perFile].sort((a, b) => a[1].killed / a[1].total - b[1].killed / b[1].total)) {
  total += s.total;
  killed += s.killed;
  log(file.padEnd(28) + String(s.killed).padStart(5) + '/' + String(s.total).padEnd(5) + Math.round((100 * s.killed) / s.total) + '%');
}
log('разом: ' + killed + '/' + total + ' = ' + ((100 * killed) / Math.max(1, total)).toFixed(1) + '%');
log('');
log('вижили:');
for (const s of survivors.sort((a, b) => a.file.localeCompare(b.file) || a.m.line - b.m.line)) {
  const text = (readFileSync(join(root, s.file), 'utf8').split('\n')[s.m.line - 1] ?? '').trim();
  log('  ' + s.file + ':' + s.m.line + '  ' + s.m.from + ' -> ' + s.m.to + '  | ' + text.slice(0, 110));
}
