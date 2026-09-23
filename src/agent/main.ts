import { loadConfig } from './config.ts';
import { loadState } from './store.ts';
import { EtherLoop } from './ether-loop.ts';
import { Registrar } from './registrar.ts';
import { startLocalApi } from './local-api.ts';
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

let publicKey: string | null = null;
try {
  const parsed = JSON.parse(keyRes.body) as { publicKey?: unknown };
  if (typeof parsed.publicKey === 'string') publicKey = parsed.publicKey;
} catch {}

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

const state = await loadState(config.statePath);
const registrar = new Registrar({
  api: config.api, statePath: config.statePath, state, now: monotonicNow,
});

const loop = new EtherLoop({
  api: config.api,
  ring,
  timeoutMs: config.requestTimeoutMs,
  intervalMs: config.etherIntervalMs,
  capacity: 20,
  refillMs: 3000,
  now: monotonicNow,
  initial: restoreEther(state.ether),
});

let memory = state.ether;

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
  snapshot: () => ({
    ether: loop.state(),
    registrar: registrar.phase(),
    blockedReason: registrar.blockedReason(),
    serverNow: loop.state().lastFrameAt === null ? null : serverNow(loop.state(), monotonicNow()),
    msUntilOpen: msUntilOpen(loop.state(), monotonicNow()),
  }),
  onApplication: (a) => registrar.setApplication(a),
  onInvitation: (c) => registrar.setInvitation(c),
});

console.log(`agent listening on ${config.api}, open http://127.0.0.1:${api.port}`);
loop.start();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    loop.stop();
    void api.close().then(() => process.exit(0));
  });
}
