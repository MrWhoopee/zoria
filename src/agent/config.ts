export type Config = {
  api: string;
  fingerprint: string | null;
  statePath: string;
  localPort: number;
  etherIntervalMs: number;
  rollIntervalMs: number;
  summaryIntervalMs: number;
  requestTimeoutMs: number;
  clientDir: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const api = env.ZORIA_API ?? 'https://zoria.net/api/v1';
  return {
    api: api.replace(/\/+$/, ''),
    fingerprint: env.ZORIA_KEY_FINGERPRINT ?? null,
    statePath: env.ZORIA_STATE ?? '.zoria-agent/state.json',
    localPort: Number(env.ZORIA_LOCAL_PORT ?? 4711),
    etherIntervalMs: Number(env.ZORIA_ETHER_MS ?? 15_000),
    rollIntervalMs: Number(env.ZORIA_ROLL_MS ?? 60_000),
    summaryIntervalMs: Number(env.ZORIA_SUMMARY_MS ?? 15_000),
    requestTimeoutMs: Number(env.ZORIA_TIMEOUT_MS ?? 20_000),
    clientDir: env.ZORIA_CLIENT_DIR ?? 'dist/client',
  };
}
