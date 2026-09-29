import { appendFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { ENGINE_HASH } from '@zoria/engine';
import { beliefLine, connectBot } from '@zoria/sdk';
import type { BotRun, WireBot } from '@zoria/sdk';
import { decodeObserve } from '@zoria/protocol';
import { withJitter } from './jitter.ts';
import { createStrategy, presets } from './strategy.ts';
import { Refusal, statusServer } from './status.ts';
import type { Head, HeadStats } from './status.ts';

const log = (line: string): void => {
  process.stdout.write(line + '\n');
};
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const env = process.env;
const url = env['ZARIA_URL'] ?? '';
const token = env['ZARIA_TOKEN'] ?? '';
const engine = env['ZARIA_ENGINE'] || ENGINE_HASH;
const beliefFile = env['ZARIA_BELIEF'] ?? '';
const statusPort = Number(env['STATUS_PORT'] ?? '') || 0;
const freeze = env['ZARIA_FREEZE'] === '1';

let preset = env['ZARIA_PRESET'] || 'основний';
let strategy = createStrategy(preset);

let phase: 'lobby' | 'live' | 'done' = 'lobby';
let why = '';
let beliefFrames = 0;
let beliefAt = 0;
let tick = 0;
let frames = 0;
let run: BotRun | null = null;
const born = Date.now();
const IDLE: HeadStats = { ticks: 0, orders: 0, nacks: 0, bytesIn: 0, bytesOut: 0, resyncMs: 0, resumes: 0, faults: 0, deferred: 0, lastTickAt: 0 };

const head: Head = {
  state: () => ({
    state: phase,
    slot: run ? run.slot : null,
    preset: preset,
    presets: presets(),
    freeze: freeze,
    tick: tick,
    frames: frames,
    ticks: run ? run.ack.ticks : 0,
    why: why,
    engine: run ? run.ack.engine : engine,
    uptimeMs: Date.now() - born,
    stats: run ? { ...run.stats } : { ...IDLE },
    belief: { frames: beliefFrames, ageMs: beliefAt ? Date.now() - beliefAt : 0 },
  }),
  promote: (value) => {
    if (typeof value !== 'string' || !presets().includes(value)) throw new Refusal(400, 'preset');
    if (phase === 'live') throw new Refusal(409, 'live');
    if (freeze) throw new Refusal(409, 'freeze');
    preset = value;
    strategy = createStrategy(preset);
    return preset;
  },
};

const server = statusPort ? statusServer(head) : null;
if (server) server.listen(statusPort, env['STATUS_HOST'] || '0.0.0.0', () => log('службовий порт ' + statusPort));

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sig, () => {
    if (run) run.close();
    if (server) server.close();
    setTimeout(() => process.exit(0), 500).unref();
  });
}

const think: number[] = [];

const bot: WireBot = {
  init(manifest, slot) {
    strategy.init(manifest, slot);
    if (beliefFile) writeFileSync(beliefFile, '');
  },
  tick(observe) {
    const t0 = performance.now();
    const out = strategy.tick(observe);
    if (beliefFile) {
      const frame = strategy.belief(decodeObserve(observe));
      if (frame) {
        appendFileSync(beliefFile, beliefLine(frame));
        beliefFrames++;
        beliefAt = Date.now();
      }
    }
    think.push(performance.now() - t0);
    return out;
  },
  feedback(verdicts) {
    strategy.feedback?.(verdicts);
  },
};

if (!url || !token) {
  why = 'потрібні ZARIA_URL і ZARIA_TOKEN: бота запускає вузол (npm run play) або стек';
  log(why);
  if (!server) process.exit(2);
} else {
  try {
    run = await withJitter(
      { tries: 20, ceilMs: 2000, onRetry: (n, ms, e) => log('вхід ' + n + ' не вдався (' + errText(e) + '), повтор через ' + ms + ' мс') },
      () =>
        connectBot({
          url,
          token,
          agent: env['ZARIA_AGENT'] || 'zaria-bot',
          bot,
          engine,
          onTick: (t, n) => {
            if (t !== null) tick = t;
            frames = n;
          },
        }),
    );
  } catch (e) {
    phase = 'done';
    why = 'у партію не ввійшов: ' + errText(e);
    log(why);
    if (!server) process.exit(1);
  }

  if (run) {
    phase = 'live';
    log('місце ' + run.slot + ', тактів ' + run.ack.ticks + ', рушій ' + run.ack.engine.slice(0, 12));
    why = await run.done;
    phase = 'done';
    const sorted = [...think].sort((a, b) => a - b);
    const q = (p: number): string => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))]!.toFixed(1) : '0');
    log(
      'партію закінчено (' +
        why +
        '): відповідей ' +
        run.stats.ticks +
        ', кидків ' +
        run.stats.faults +
        ', повернень ' +
        run.stats.resumes +
        '; дума, мс: p50 ' +
        q(50) +
        ', p99 ' +
        q(99) +
        ', max ' +
        q(100),
    );
    if (!server) process.exit(0);
  }
}
