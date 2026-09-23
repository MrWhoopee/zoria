import { initialEther, type EtherState, type Letter } from '../protocol/ether.ts';

export type EtherMemory = {
  opensAt: string | null;
  closesAt: string | null;
  fragments: Record<number, string>;
  fragmentsOf: number | null;
  archive: Letter[];
};

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());
const epoch = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
};

export function emptyMemory(): EtherMemory {
  return { opensAt: null, closesAt: null, fragments: {}, fragmentsOf: null, archive: [] };
}

export function rememberEther(e: EtherState): EtherMemory {
  return {
    opensAt: iso(e.opensAt),
    closesAt: iso(e.closesAt),
    fragments: e.fragments,
    fragmentsOf: e.fragmentsOf,
    archive: e.archive,
  };
}

export function restoreEther(m: Partial<EtherMemory>): EtherState {
  return {
    ...initialEther(),
    opensAt: epoch(m.opensAt),
    closesAt: epoch(m.closesAt),
    fragments: m.fragments ?? {},
    fragmentsOf: m.fragmentsOf ?? null,
    archive: m.archive ?? [],
  };
}

export function sameMemory(a: EtherMemory, b: EtherMemory): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
