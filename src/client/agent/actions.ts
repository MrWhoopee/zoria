import { OFFLINE, readOutcome, type Outcome } from './outcome.ts';
import type { Stage } from '../../agent/account.ts';

async function post(path: string, signal: AbortSignal): Promise<Outcome> {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal });
    return readOutcome(await res.json() as unknown);
  } catch {
    return { ok: false, ...OFFLINE };
  }
}

const part = (id: string): string => encodeURIComponent(id);

export const ackStage = (id: string, signal: AbortSignal): Promise<Outcome> => post(`/account/stages/${part(id)}/ack`, signal);
export const markRead = (id: string, signal: AbortSignal): Promise<Outcome> => post(`/account/inbox/${part(id)}/read`, signal);
export const login = (signal: AbortSignal): Promise<Outcome> => post('/account/login', signal);
export const logout = (signal: AbortSignal): Promise<Outcome> => post('/account/logout', signal);
export const roll = (signal: AbortSignal): Promise<Outcome> => post('/account/roll', signal);

export async function getStage(id: string, signal: AbortSignal): Promise<Stage | null> {
  try {
    const res = await fetch(`/account/stages/${part(id)}`, { signal });
    if (!res.ok) return null;
    const body = await res.json() as { stage?: Stage };
    return body.stage ?? null;
  } catch {
    return null;
  }
}
