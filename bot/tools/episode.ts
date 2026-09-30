import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createEngine } from '@zoria/engine';
import { openJournal } from '@zoria/sdk';
import { decodeOrders, encodeVerdicts, readRunLog } from '@zoria/protocol';
import type { Order, SlotName } from '@zoria/protocol';
import type { DecisionRecord } from '../src/decisions.ts';
import { createStrategy } from '../src/strategy.ts';

const CODE: [string, string][] = [
  ['yard', 'src/plans/yard.ts'],
  ['expand', 'src/plans/expand.ts'],
  ['guard', 'src/plans/guard.ts'],
  ['keepalive', 'src/plans/keepalive.ts'],
];

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    slot: { type: 'string', default: 'A' },
    from: { type: 'string', default: '1' },
    to: { type: 'string', default: '1200' },
    preset: { type: 'string', default: 'основний' },
  },
});

interface Tape {
  slot: SlotName;
  tick(frame: Uint8Array): Uint8Array;
}

interface Cursor {
  ticks: number;
  tapes: Tape[];
  m: { manifest: Uint8Array };
  seek(t: number): void;
}

const file = positionals[0];
if (!file) throw new Error('usage: npm run episode -- <match.runlog> --slot A --from 300 --to 360');
const slot = values.slot as SlotName;
const from = Number(values.from);
const to = Number(values.to);
const out = (line: string): void => {
  process.stdout.write(line + '\n');
};
const codeOf = (tag: string): string => CODE.find(([p]) => tag.startsWith(p))?.[1] ?? '?';
const said = (o: Order): string => JSON.stringify(o).replace(/"/g, '');

const bytes = readFileSync(file);
const denied = new Set((readRunLog(bytes).denies ?? []).filter(([s]) => s === slot).map(([, t, i]) => t + ':' + i));
const cursor = openJournal(createEngine, bytes) as unknown as Cursor;
const tape = cursor.tapes.find((x) => x.slot === slot);
if (!tape) throw new Error('slot ' + slot + ' was not played by a recorded bot in this journal');
const strategy = createStrategy(values.preset);
strategy.init(cursor.m.manifest, slot);
const played = tape.tick.bind(tape);
let same = 0;
let total = 0;
const records: { record: DecisionRecord; real: Order[] }[] = [];
tape.tick = (frame: Uint8Array): Uint8Array => {
  strategy.tick(frame);
  const answer = played(frame);
  const real = decodeOrders(answer) ?? [];
  const record = strategy.decisions();
  if (record) {
    const accepted = new Set(real.filter((_, i) => !denied.has(record.t + ':' + i)).map(said));
    strategy.feedback?.(encodeVerdicts(record.chosen.map((c, i) => [i, accepted.has(said(c.order)), accepted.has(said(c.order)) ? 0 : 21])));
    total++;
    const mine = record.chosen.map((c) => said(c.order)).join('|');
    if (mine === real.map(said).join('|')) same++;
    if (record.t >= from && record.t <= to) records.push({ record, real });
  }
  return answer;
};
cursor.seek(Math.min(to, cursor.ticks));
out('журнал ' + file + ', слот ' + slot + ', пресет ' + values.preset + ', такти ' + from + '-' + to);
out('збіг рішень із записом: ' + same + '/' + total + ' тактів' + (same === total ? '' : ' (розбіжність: інша версія бота чи пресет)'));
for (const { record, real } of records) {
  if (record.chosen.length === 0 && real.length === 0) continue;
  out('');
  out('такт ' + record.t + ': запропоновано ' + record.offered + ', помилок радників ' + record.errors);
  for (const c of record.chosen) out('  ' + c.tag.padEnd(16) + ' ' + (c.unit ?? '-').padEnd(7) + ' цінність ' + c.value.toPrecision(3).padEnd(8) + ' ' + said(c.order) + '  <- ' + codeOf(c.tag));
  const mine = record.chosen.map((c) => said(c.order)).join('|');
  if (mine !== real.map(said).join('|')) out('  у записі було: ' + real.map(said).join('; '));
}
