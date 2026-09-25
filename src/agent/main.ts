import { loadConfig } from './config.ts';
import { loadState, StateBox } from './store.ts';
import { EtherLoop } from './ether-loop.ts';
import { Registrar } from './registrar.ts';
import { asPublicKey } from './wire.ts';
import { callReply, startLocalApi, type ActionReply } from './local-api.ts';
import { Session } from './session.ts';
import { makeCaller, fetchRepoAccess } from './server.ts';
import { Mailroom } from './mailroom.ts';
import { rememberEther, restoreEther, sameMemory } from './memory.ts';
import { KeyRing, makeStationKey } from '../protocol/keyring.ts';
import { fetchRaw } from './http.ts';
import { backoffMs } from './backoff.ts';
import { msUntilOpen, serverNow } from '../protocol/ether.ts';
import type { RawResponse } from '../protocol/classify.ts';

process.on('unhandledRejection', (reason) => {
  console.error('unhandled rejection:', reason instanceof Error ? reason.stack ?? reason.message : reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('uncaught exception:', err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});

const monotonicNow = (): number => Math.round(performance.timeOrigin + performance.now());

const config = loadConfig();

if (!config.fingerprint) {
  console.error(
    'ZORIA_KEY_FINGERPRINT is not set.\n' +
    'The live station key fingerprint is published in the spec, part 1, section 3.\n' +
    'The stand signs with its own key; its fingerprint is in the README.',
  );
  process.exit(1);
}

const ring = new KeyRing();

const MAX_KEY_FETCH_ATTEMPTS = 20;

async function fetchStationKey(): Promise<RawResponse> {
  for (let attempt = 0; attempt < MAX_KEY_FETCH_ATTEMPTS; attempt += 1) {
    const res = await fetchRaw(`${config.api}/ether/key`, {}, config.requestTimeoutMs, monotonicNow);
    if (!('failed' in res)) return res;
    console.error(
      `could not fetch the station key (attempt ${attempt + 1}/${MAX_KEY_FETCH_ATTEMPTS}): ${res.failed}`,
    );
    if (attempt < MAX_KEY_FETCH_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, backoffMs(attempt)));
    }
  }
  console.error(`giving up on the station key after ${MAX_KEY_FETCH_ATTEMPTS} attempts, exiting`);
  process.exit(1);
}

const keyRes = await fetchStationKey();

const publicKey = asPublicKey(keyRes.body);

if (publicKey === null) {
  console.error(
    `unexpected response from ${config.api}/ether/key (HTTP ${keyRes.status}): ` +
    `${keyRes.body.slice(0, 200)}`,
  );
  process.exit(1);
}

try {
  ring.add(await makeStationKey(publicKey, config.fingerprint));
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  console.error('station key rejected: check ZORIA_KEY_FINGERPRINT against the task text, section 3');
  process.exit(1);
}
console.log('station key accepted, fingerprint verified');

const store = new StateBox(config.statePath, await loadState(config.statePath));
const registrar = new Registrar({ api: config.api, store, now: monotonicNow });
const session = new Session({ api: config.api, store, timeoutMs: config.requestTimeoutMs });
const call = makeCaller({ api: config.api, session, timeoutMs: config.requestTimeoutMs });
const mailroom = new Mailroom({
  call,
  loadConfig: () => fetchRepoAccess(config.api, config.requestTimeoutMs),
  ready: () => {
    const s = session.state();
    return s === 'active' || s === 'expired';
  },
  intervalMs: config.summaryIntervalMs,
});

const offline = (status: number, code: string, retryInMs = 0): ActionReply =>
  ({ ok: false, status, code, requestId: null, retryAfter: Math.ceil(retryInMs / 1000) });

const loop = new EtherLoop({
  api: config.api,
  ring,
  timeoutMs: config.requestTimeoutMs,
  intervalMs: config.etherIntervalMs,
  capacity: 20,
  refillMs: 3000,
  now: monotonicNow,
  initial: restoreEther(store.get().ether),
});

let memory = store.get().ether;

loop.on((ether, obs) => {
  const mark = obs.t === 'signal' ? `signal ${obs.frame.phase}` : obs.t;
  console.log(`[${new Date(monotonicNow()).toISOString()}] ${mark} | phase=${ether.phase} | ${registrar.phase()}`);
  const next = rememberEther(ether);
  if (!sameMemory(memory, next)) {
    memory = next;
    registrar.remember(next).catch((err: unknown) => {
      console.error(`could not save the letter: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
  registrar.onEther(ether).catch((err: unknown) => {
    console.error(`registrar failed: ${err instanceof Error ? err.message : String(err)}`);
  });
});

loop.onError((err) => {
  console.error('ether loop tick failed:', err instanceof Error ? err.message : err);
});

const api = await startLocalApi({
  port: config.localPort,
  clientDir: config.clientDir,
  snapshot: () => {
    const app = store.get().application;
    return {
      ether: loop.state(),
      registrar: registrar.phase(),
      blockedReason: registrar.blockedReason(),
      serverNow: loop.state().lastFrameAt === null ? null : serverNow(loop.state(), monotonicNow()),
      msUntilOpen: msUntilOpen(loop.state(), monotonicNow()),
      account: {
        session: {
          state: session.state(), expiresAt: session.expiresAt(),
          username: app?.username ?? null, displayName: app?.displayName ?? null,
        },
        ...mailroom.data(),
      },
    };
  },
  account: {
    stage: (id) => mailroom.stage(id),
    ack: async (id) => callReply(await mailroom.ack(id), { stage: mailroom.stage(id) }),
    read: async (id) => {
      const r = await mailroom.markRead(id);
      return callReply(r, { message: mailroom.data().inbox.find((m) => m.id === id) ?? null });
    },
    login: async () => {
      const ok = await session.login();
      mailroom.reset();
      if (ok) return { ok: true };
      const f = session.lastFailure();
      return offline(f?.status ?? 401, f?.code ?? 'sign-in-failed', (f?.retryAfter ?? 0) * 1000);
    },
    logout: async () => {
      await session.logout();
      mailroom.reset();
      return { ok: true };
    },
    roll: async () => {
      const r = await loop.roll();
      if (r.ok) return { ok: true, entries: r.entries, at: new Date(r.at).toISOString() };
      const status = r.reason === 'jammed' || r.reason === 'too-soon' || r.reason === 'silent' || r.reason === 'budget' ? 429
        : r.reason === 'stopping' ? 503 : 0;
      return offline(status, r.reason, r.retryInMs);
    },
  },
  onApplication: (a) => registrar.setApplication(a),
  onInvitation: (c) => registrar.setInvitation(c),
});

console.log(`agent listening on ${config.api}, open http://127.0.0.1:${api.port}`);
loop.start();
mailroom.start();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    loop.stop();
    mailroom.stop();
    api.close().then(
      () => process.exit(0),
      (err: unknown) => {
        console.error('could not close the local API:', err instanceof Error ? err.message : err);
        process.exit(1);
      },
    );
  });
}
