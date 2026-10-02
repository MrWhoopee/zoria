import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileSafe } from './names.ts';
import { isRecord } from './record.ts';

export function saveRecord(dir: string, body: string): string {
  let rec: unknown;
  try {
    rec = JSON.parse(body);
  } catch {
    throw new Error('bad arena record');
  }
  if (!isRecord(rec)) throw new Error('bad arena record');
  const stamp = rec.at.slice(0, 19).replace(/:/g, '-');
  const name = fileSafe(stamp + '-s' + rec.seed + '-' + rec.slot + '-' + rec.rivals.join('-')) + '.json';
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), JSON.stringify(rec, null, 1));
  return name;
}
