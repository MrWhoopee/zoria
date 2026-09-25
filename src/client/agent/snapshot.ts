import type { Snapshot } from '../../agent/local-api.ts';

export type { Snapshot };

export function parseSnapshot(text: string): Snapshot | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const s = value as Record<string, unknown>;
  const ether = s.ether as Record<string, unknown> | null | undefined;
  if (typeof ether !== 'object' || ether === null || !Array.isArray(ether.ribbon)) return null;
  if (typeof s.registrar !== 'string') return null;
  if (!Array.isArray(ether.archive)) ether.archive = [];
  const account = s.account as Record<string, unknown> | null | undefined;
  if (account !== undefined && (typeof account !== 'object' || account === null)) delete s.account;
  else if (account) {
    for (const key of ['stages', 'inbox', 'news'] as const) if (!Array.isArray(account[key])) account[key] = [];
    if (typeof account.session !== 'object' || account.session === null) delete s.account;
  }
  if (ether.silentWhy === undefined) ether.silentWhy = null;
  return value as Snapshot;
}
