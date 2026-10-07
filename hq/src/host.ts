import { openHost } from './guest.js';

export interface PackEntry {
  id: string;
  title: string;
  preset: string;
  pack: string | Record<string, unknown>;
}

export interface LiveStart {
  manifest: Uint8Array | ArrayBuffer;
  bots: string[];
  roster: string[];
  ticks: number;
  seat: number;
}

export interface Host {
  v: number;
  mode: 'record' | 'live' | 'none';
  lang: 'uk' | 'en';
  packs(): PackEntry[];
  live(): LiveStart | null;
  file(id: string, name: string): Promise<ArrayBuffer | string>;
  cap(): number;
  on(type: string, fn: (m: Record<string, unknown>) => void): () => void;
  ready(t: number): void;
  promote(preset: string): Promise<{ ok: boolean; status: number; detail?: string }>;
}

export function connect(name: string): Promise<Host> {
  return (openHost as (o: { hq: string }) => Promise<Host>)({ hq: name });
}
