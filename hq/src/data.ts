import type { Host, PackEntry } from './host.ts';
import { packData } from './model/derive.ts';
import type { PackData } from './model/derive.ts';
import type { PackSummary } from './model/names.ts';

const bytesOf = (x: ArrayBuffer | string): Uint8Array => (typeof x === 'string' ? new TextEncoder().encode(x) : new Uint8Array(x));
const textOf = (x: ArrayBuffer | string): string => (typeof x === 'string' ? x : new TextDecoder().decode(x));

export function summaryOf(p: PackEntry): string {
  return typeof p.pack === 'string' ? p.pack : JSON.stringify(p.pack);
}

export async function loadPack(host: Host, p: PackEntry): Promise<PackData> {
  const json = summaryOf(p);
  const summary = JSON.parse(json) as PackSummary;
  const runlogs = await Promise.all(summary.matches.map((m) => host.file(p.id, m.file).then(bytesOf)));
  const names = summary.belief?.files ?? [];
  const diaries = await Promise.all(summary.matches.map((_, i) => (names[i] ? host.file(p.id, names[i]).then(textOf, () => null) : Promise.resolve(null))));
  return packData(p.id, json, runlogs, diaries);
}
