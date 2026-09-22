import { loadConfig } from './config.ts';
import { loadState } from './store.ts';
import { EtherLoop } from './ether-loop.ts';
import { Registrar } from './registrar.ts';
import { startLocalApi } from './local-api.ts';
import { KeyRing, makeStationKey } from '../protocol/keyring.ts';
import { fetchRaw } from './http.ts';
import { msUntilOpen, serverNow } from '../protocol/ether.ts';

const config = loadConfig();

if (!config.fingerprint) {
  console.error(
    'ZORIA_KEY_FINGERPRINT is not set.\n' +
    'The station key fingerprint is published in the spec, part 1, section 3.\n' +
    'For a test stand, use the learning fingerprint:\n' +
    '  ZORIA_KEY_FINGERPRINT=f3a436df65614f08635f18fe0f64f145285203f1faa2905ecb25ffb90969a7de',
  );
  process.exit(1);
}

const ring = new KeyRing();

const keyRes = await fetchRaw(`${config.api}/ether/key`, {}, config.requestTimeoutMs);
if ('failed' in keyRes) {
  console.error(`could not fetch the station key: ${keyRes.failed}`);
  process.exit(1);
}

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

ring.add(await makeStationKey(publicKey, config.fingerprint));
console.log('station key accepted, fingerprint verified');

const state = await loadState(config.statePath);
const registrar = new Registrar({ api: config.api, statePath: config.statePath, state });

const loop = new EtherLoop({
  api: config.api,
  ring,
  timeoutMs: config.requestTimeoutMs,
  intervalMs: config.etherIntervalMs,
  capacity: 20,
  refillMs: 3000,
});

loop.on((ether, obs) => {
  const mark = obs.t === 'signal' ? `signal ${obs.frame.phase}` : obs.t;
  console.log(`[${new Date().toISOString()}] ${mark} | phase=${ether.phase} | ${registrar.phase()}`);
  void registrar.onEther(ether);
});

loop.onError((err) => {
  console.error('ether loop tick failed:', err instanceof Error ? err.message : err);
});

const api = await startLocalApi({
  port: config.localPort,
  snapshot: () => ({
    ether: loop.state(),
    registrar: registrar.phase(),
    blockedReason: registrar.blockedReason(),
    serverNow: loop.state().lastFrameAt === null ? null : serverNow(loop.state(), Date.now()),
    msUntilOpen: msUntilOpen(loop.state(), Date.now()),
  }),
  onApplication: (a) => registrar.setApplication(a),
  onInvitation: (c) => registrar.setInvitation(c),
});

console.log(`agent listening on ${config.api}, local API at http://127.0.0.1:${api.port}`);
loop.start();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    loop.stop();
    void api.close().then(() => process.exit(0));
  });
}
