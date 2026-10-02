import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '../arena/record.ts';
import { replay } from '../arena/replay.ts';
import { review } from './arena/review.ts';

const dir = 'league/arena';
const arg = process.argv[2];
const file = arg ?? join(dir, readdirSync(dir).filter((f) => f.endsWith('.json')).sort().at(-1) ?? '');
const rec: unknown = JSON.parse(readFileSync(file, 'utf8'));
if (!isRecord(rec)) throw new Error('not an arena record: ' + file);
process.stdout.write('файл ' + file + '\n');
const mine = replay(rec, true);
const alone = replay(rec, false);
for (const line of review(rec, mine, alone)) process.stdout.write(line + '\n');
