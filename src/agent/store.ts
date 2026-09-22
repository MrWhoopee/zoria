import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

export type Application = {
  username: string;
  displayName: string;
  password: string;
  invitation: string;
  repositoryUrl: string;
  lang: 'uk' | 'en';
};

export type Registration = {
  attemptedAt: string | null;
  token: string | null;
  sessionId: string | null;
  expiresAt: string | null;
};

export type AgentState = {
  application: Application | null;
  registration: Registration;
  ether: { opensAt: string | null; closesAt: string | null; fragments: Record<number, string> };
};

const writeQueues = new Map<string, Promise<void>>();

export function emptyState(): AgentState {
  return {
    application: null,
    registration: { attemptedAt: null, token: null, sessionId: null, expiresAt: null },
    ether: { opensAt: null, closesAt: null, fragments: {} },
  };
}

export async function loadState(path: string): Promise<AgentState> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<AgentState>;
    const base = emptyState();
    return {
      application: parsed.application ?? base.application,
      registration: { ...base.registration, ...parsed.registration },
      ether: { ...base.ether, ...parsed.ether },
    };
  } catch {
    return emptyState();
  }
}

export async function saveState(path: string, state: AgentState): Promise<void> {
  const body = `${JSON.stringify(state, null, 2)}\n`;
  const previous = writeQueues.get(path) ?? Promise.resolve();
  const next = previous.then(async () => {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${randomUUID()}.tmp`;
    await writeFile(tmp, body, { encoding: 'utf8', mode: 0o600 });
    await rename(tmp, path);
  });
  writeQueues.set(path, next.catch(() => {}));
  return next;
}
