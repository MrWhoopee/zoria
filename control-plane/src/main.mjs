/* control-plane :: службові ручки бота
   площина керування стека: все, що питають у бота ззовні.

     GET  /health           готовність; неготовий бот - 503, а не 200 з
                            сумним полем: на цій ручці стоїть прогін
     GET  /metrics          Prometheus; п'ять лічильників канону обов'язкові
     POST /presets/promote  зміна стратегії без перезбирання; у бою - 409
     GET  /belief-stream    SSE щоденника віри: хвіст файлу, рядок у рядок
     GET  /livez, /presets  понад контракт: живість і список пресетів

   Нормовано каноном - перші чотири (`kit/02-control-plane.md`).

   Свого стану про бій у control-plane немає: знімок береться в голови на
   кожен запит її внутрішнім портом (мережа plane, назовні не виходить).
   Заради чого шов: голова догравує партію, навіть якщо цю площину
   перезапустили, а передплатники belief-stream читають файл у цьому
   процесі, а не в петлі такту.

   Залежностей немає навмисно: node:http плюс файл щоденника. Свій NestJS,
   свій кеш і свою чергу ставте - це ваша архітектура, і вона
   оцінюється кодом. */

import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { createServer } from 'node:http';

const int = (name, def, min, max) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(name + ' - не число в допустимих межах: ' + raw);
  return n;
};

const CFG = {
  port: int('PORT', 7801, 0, 65535),
  host: process.env.HOST || '0.0.0.0',
  headUrl: (process.env.HEAD_URL || 'http://127.0.0.1:7811').replace(/\/+$/, ''),
  headTimeoutMs: int('HEAD_TIMEOUT_MS', 1000, 50, 60_000),
  belief: process.env.ZARIA_BELIEF || '/data/belief.ndjson',
  tailMs: int('TAIL_MS', 100, 10, 5000),
};

/* ===== голова: знімок на кожен запит ===== */

async function headState() {
  try {
    const r = await fetch(CFG.headUrl + '/state', { signal: AbortSignal.timeout(CFG.headTimeoutMs) });
    if (!r.ok) return { ok: false, why: 'HTTP ' + r.status };
    return { ok: true, state: await r.json() };
  } catch (e) {
    return { ok: false, why: e instanceof Error ? e.message : String(e) };
  }
}

async function headPost(path, body) {
  const r = await fetch(CFG.headUrl + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CFG.headTimeoutMs),
  });
  const text = await r.text();
  try {
    return { code: r.status, body: JSON.parse(text) };
  } catch {
    return { code: r.status, body: { error: text } };
  }
}

/* слова відмови голови машинні - перекладає їх той, хто говорить з людиною */
const REFUSAL = {
  preset: 'пресета з таким іменем немає',
  live: 'йде прогін: зміна стратегії в бою була б зміною гравця',
  freeze: 'здачу заморожено',
  json: 'тіло запиту - обʼєкт JSON з полем preset',
};

/* ===== щоденник віри: хвіст файлу ===== */

const NL = 0x0a;

/* Опитування розміру, а не fs.watch: тому діляться два контейнери, і
   inotify через межу тому поводиться на різних хостах по-різному. Нова
   партія обнуляє щоденник; усічення розпізнається як у tail -F - файл
   коротший за прочитаний або байти останнього цілого рядка вже інші */
class Tail {
  constructor(file, everyMs) {
    this.file = file;
    this.offset = 0;
    this.lastStart = 0;
    this.lastLine = null;
    this.partial = Buffer.alloc(0);
    this.skip = false;
    this.clients = new Set();
    const fd = this.open();
    if (fd !== null) {
      try {
        this.offset = fstatSync(fd).size;
        if (this.offset > 0) {
          const last = Buffer.alloc(1);
          readSync(fd, last, 0, 1, this.offset - 1);
          this.skip = last[0] !== NL;
        }
      } finally {
        closeSync(fd);
      }
    }
    this.timer = setInterval(() => this.poll(), everyMs);
    this.timer.unref();
  }

  open() {
    try {
      return openSync(this.file, 'r');
    } catch {
      return null; /* щоденника ще немає: голова не сідала за стіл */
    }
  }

  poll() {
    const fd = this.open();
    if (fd === null) return;
    try {
      let size = fstatSync(fd).size;
      if (size < this.offset || this.rewritten(fd)) {
        this.offset = 0;
        this.lastStart = 0;
        this.lastLine = null;
        this.partial = Buffer.alloc(0);
        this.skip = false;
        size = fstatSync(fd).size;
      }
      if (size <= this.offset) return;
      const buf = Buffer.alloc(size - this.offset);
      const n = readSync(fd, buf, 0, buf.length, this.offset);
      this.offset += n;
      this.feed(buf.subarray(0, n));
    } finally {
      closeSync(fd);
    }
  }

  rewritten(fd) {
    if (!this.lastLine) return false;
    const probe = Buffer.alloc(this.lastLine.length);
    const n = readSync(fd, probe, 0, probe.length, this.lastStart);
    return n !== probe.length || !probe.equals(this.lastLine);
  }

  feed(chunk) {
    const data = this.partial.length ? Buffer.concat([this.partial, chunk]) : chunk;
    const base = this.offset - data.length;
    let from = 0;
    for (;;) {
      const nl = data.indexOf(NL, from);
      if (nl < 0) break;
      if (this.skip) this.skip = false;
      else {
        this.lastStart = base + from;
        this.lastLine = Buffer.from(data.subarray(from, nl + 1));
        const line = data.subarray(from, nl).toString('utf8');
        for (const res of this.clients) res.write('data: ' + line + '\n\n');
      }
      from = nl + 1;
    }
    this.partial = Buffer.from(data.subarray(from));
  }
}

const tail = new Tail(CFG.belief, CFG.tailMs);

/* ===== ручки ===== */

function json(res, code, value) {
  const text = JSON.stringify(value);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

function body(req, limit = 1024) {
  return new Promise((ok, bad) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) {
        bad(new Error('json'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('json');
        ok(v);
      } catch {
        bad(new Error('json'));
      }
    });
    req.on('error', bad);
  });
}

async function health(res) {
  const h = await headState();
  if (!h.ok) {
    json(res, 503, { status: 'starting', state: 'unreachable', slot: null, tick: 0, frames: 0, ticks: 0, why: 'голова не відповідає: ' + h.why, engine: '', head: 'unreachable' });
    return;
  }
  const v = h.state;
  /* готовність - це "провід живий або прогін чесно закінчено"; лобі і
     простій готовністю не вважаються, аварійний кінець - тим паче */
  const ready = v.state === 'live' || (v.state === 'done' && v.why === 'end');
  json(res, ready ? 200 : 503, {
    status: ready ? 'ok' : v.state === 'done' ? 'failed' : 'starting',
    state: v.state,
    slot: v.slot,
    preset: v.preset,
    tick: v.tick,
    frames: v.frames,
    ticks: v.ticks,
    why: v.why,
    engine: v.engine,
    uptimeMs: v.uptimeMs,
    head: 'ok',
  });
}

function metric(name, help, type, value) {
  return ['# HELP ' + name + ' ' + help, '# TYPE ' + name + ' ' + type, name + ' ' + value];
}

async function metrics(res) {
  const h = await headState();
  const lines = [...metric('bot_head_up', 'Чи відповідає голова на внутрішньому порту', 'gauge', h.ok ? 1 : 0)];
  if (h.ok) {
    const v = h.state;
    const s = v.stats;
    /* пʼять лічильників канону: прибирати їх не можна - по них прогін і
       джадж читають усіх ботів однаково (kit/02-control-plane.md) */
    lines.push(
      ...metric('bot_ticks_processed', 'Тактів оброблено на проводі', 'counter', s.ticks),
      ...metric('bot_orders_sent', 'Кадрів наказів надіслано', 'counter', s.orders),
      ...metric('bot_nacks', 'Відмов комірця', 'counter', s.nacks),
      ...metric('bot_resync_seconds', 'Секунд на присягу і перезбирання картини світу', 'counter', (s.resyncMs / 1000).toFixed(3)),
      ...metric('bot_belief_snapshot_age', 'Секунд з останнього кадру віри', 'gauge', (v.belief.ageMs / 1000).toFixed(3)),
      /* понад канон - що завгодно: додавайте своє */
      ...metric('bot_live', 'Голова за столом', 'gauge', v.state === 'live' ? 1 : 0),
      ...metric('bot_wire_bytes_in', 'Байт із проводу', 'counter', s.bytesIn),
      ...metric('bot_wire_bytes_out', 'Байт у провід', 'counter', s.bytesOut),
      ...metric('bot_resumes', 'Повернень за партію', 'counter', s.resumes),
      ...metric('bot_faults', 'Кидків голови', 'counter', s.faults),
      ...metric('bot_belief_frames', 'Кадрів віри записано', 'counter', v.belief.frames),
    );
  }
  lines.push(...metric('bot_belief_stream_clients', 'Передплатників belief-stream', 'gauge', tail.clients.size));
  const text = lines.join('\n') + '\n';
  res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

function beliefStream(req, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
  res.write(': belief-stream\n\n');
  tail.clients.add(res);
  req.on('close', () => tail.clients.delete(res));
}

async function route(req, res) {
  const path = (req.url || '/').split('?')[0];
  if (req.method === 'GET' && path === '/livez') return json(res, 200, { status: 'ok' });
  if (req.method === 'GET' && path === '/health') return health(res);
  if (req.method === 'GET' && path === '/metrics') return metrics(res);
  if (req.method === 'GET' && path === '/belief-stream') return beliefStream(req, res);
  if (req.method === 'GET' && path === '/presets') {
    const h = await headState();
    if (!h.ok) return json(res, 503, { error: 'голова не відповідає: ' + h.why });
    return json(res, 200, { active: h.state.preset, known: h.state.presets });
  }
  if (req.method === 'POST' && path === '/presets/promote') {
    let asked;
    try {
      asked = (await body(req)).preset;
    } catch {
      return json(res, 400, { error: REFUSAL.json });
    }
    let answer;
    try {
      answer = await headPost('/preset', { preset: asked });
    } catch (e) {
      return json(res, 503, { error: 'голова не відповідає: ' + (e instanceof Error ? e.message : String(e)) });
    }
    if (answer.code === 200) return json(res, 200, answer.body);
    return json(res, answer.code, { error: REFUSAL[answer.body.error] || String(answer.body.error) });
  }
  return json(res, 404, { error: 'немає такої ручки' });
}

const server = createServer((req, res) => {
  void route(req, res).catch((e) => json(res, 500, { error: e instanceof Error ? e.message : String(e) }));
});

server.listen(CFG.port, CFG.host, () => {
  process.stdout.write('[control-plane] ' + CFG.host + ':' + CFG.port + ', голова ' + CFG.headUrl + '\n');
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.once(sig, () => {
    for (const res of tail.clients) res.end();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  });
}
