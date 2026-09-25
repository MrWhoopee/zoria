import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { emptyMemory, type EtherMemory } from './memory.ts';

export type Application = {
  username: string;
  displayName: string;
  password: string;
  invitation: string;
  repositoryUrl: string;
  lang: 'uk' | 'en';
};

export type Registration = {
  registered: boolean;
  attemptedAt: string | null;
  token: string | null;
  sessionId: string | null;
  expiresAt: string | null;
};

export type AgentState = {
  application: Application | null;
  registration: Registration;
  ether: EtherMemory;
};

const writeQueues = new Map<string, Promise<void>>();

export function emptyState(): AgentState {
  return {
    application: null,
    registration: { registered: false, attemptedAt: null, token: null, sessionId: null, expiresAt: null },
    ether: emptyMemory(),
  };
}

export async function loadState(path: string): Promise<AgentState> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return emptyState();
    throw err;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AgentState> | null;
    const base = emptyState();
    const registration = { ...base.registration, ...parsed?.registration };
    if (typeof parsed?.registration?.registered !== 'boolean') {
      registration.registered = typeof registration.token === 'string' && registration.token.length > 0;
    }
    return {
      application: parsed?.application ?? base.application,
      registration,
      ether: { ...base.ether, ...parsed?.ether },
    };
  } catch {
    return emptyState();
  }
}

export async function saveState(path: string, state: AgentState): Promise<void> {
  const body = `${JSON.stringify(state, null, 2)}\n`;
  const previous = writeQueues.get(path) ?? Promise.resolve();
  const next = previous.then(async () => {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const tmp = `${path}.${randomUUID()}.tmp`;
    const handle = await open(tmp, 'w', 0o600);
    try {
      await handle.writeFile(body, { encoding: 'utf8' });
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmp, path);
  });
  writeQueues.set(path, next.catch(() => {}));
  return next;
}

export class StateBox {
  readonly #path: string;
  #state: AgentState;
  #queue: Promise<void> = Promise.resolve();

  constructor(path: string, initial: AgentState) {
    this.#path = path;
    this.#state = initial;
  }

  get(): AgentState {
    return this.#state;
  }

  update(fn: (s: AgentState) => AgentState): Promise<void> {
    const run = this.#queue.then(async () => {
      const next = fn(this.#state);
      await saveState(this.#path, next);
      this.#state = next;
    });
    this.#queue = run.then(() => undefined, () => undefined);
    return run;
  }
}
