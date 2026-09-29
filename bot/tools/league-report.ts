import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { kindOf } from './league/roster.ts';
import { readRecords, report } from './league/report.ts';

const { positionals } = parseArgs({ allowPositionals: true });
const records = positionals.flatMap((f) => readRecords(readFileSync(f, 'utf8')));
const players = [...new Set(records.flatMap((r) => r.cast))].filter((n) => kindOf(n) === 'preset');
for (const line of report(records, players)) process.stdout.write(line + '\n');
