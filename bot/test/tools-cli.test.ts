import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine } from '@zoria/engine';
import { openMatch } from '@zoria/sdk';
import type { WireBot } from '@zoria/sdk';
import type { SlotName } from '@zoria/protocol';
import { seatOf } from '../tools/league/roster.ts';

const tool = (name: string): string => fileURLToPath(new URL('../tools/' + name, import.meta.url));
const SLOTS: SlotName[] = ['A', 'B', 'C'];
const CAST = ['глушій-7', 'рівний', 'обхідник'];

function run(name: string, args: string[], cwd: string): { code: number | null; out: string; err: string } {
  const r = spawnSync(process.execPath, [tool(name), ...args], { cwd, encoding: 'utf8', timeout: 120000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function direct(seed: number, k: number, ticks: number): { slots: Record<string, string>; score: Record<string, number>; breakdown: Record<string, { jams: number; rams: number }> } {
  const bots: Partial<Record<SlotName, WireBot>> = {};
  const styles: Partial<Record<SlotName, Record<string, unknown>>> = {};
  const slots: Record<string, string> = {};
  CAST.forEach((name, i) => {
    const slot = SLOTS[(i + k - 1) % 3] ?? 'A';
    const seat = seatOf(name);
    if (seat.bot) bots[slot] = seat.bot();
    if (seat.style) styles[slot] = seat.style;
    slots[slot] = name;
  });
  const m = openMatch(createEngine, { seed, ticks, bots, styles });
  while (!m.done()) m.step();
  const s = m.summary() as unknown as { score: Record<string, number>; breakdown: Record<string, { jams: number; rams: number }> };
  return { slots, score: s.score, breakdown: s.breakdown };
}

test('inspect prints a row per hundred ticks and totals that match the engine', () => {
  const r = run('inspect.ts', ['--seed', '31', '--cast', CAST.join(','), '--match', '2'], process.cwd());
  assert.equal(r.code, 0, r.err);
  const lines = r.out.split('\n');
  const want = direct(31, 2, 1200);
  assert.equal(lines[0], 'жереб 31, партія 2: ' + SLOTS.map((s) => s + '=' + want.slots[s]).join(' '));
  const rows = lines.filter((l) => /^\s*\d+  хв /.test(l));
  assert.deepEqual(rows.map((l) => Number(l.trim().split(' ')[0])), [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200]);
  for (const row of rows) assert.equal((row.match(/хв \d+ г \d+\/\d+ Т\d+(\(\d+в\))? К\d+ з\d+/g) ?? []).length, 3, row);
  assert.equal(lines.find((l) => l.startsWith('рахунок: ')), 'рахунок: ' + SLOTS.map((p) => p + ' ' + (want.score[p] ?? 0).toFixed(1)).join(', '));
  assert.equal(lines.find((l) => l.startsWith('тарани: ')), 'тарани: ' + SLOTS.map((p) => p + ' ' + (want.breakdown[p]?.rams ?? 0)).join(', '));
  assert.equal(lines.find((l) => l.startsWith('завади: ')), 'завади: ' + SLOTS.map((p) => p + ' ' + (want.breakdown[p]?.jams ?? 0)).join(', '));
  assert.ok(lines.includes('захоплення (хто <- у кого): '));
  const lost = lines.slice(lines.indexOf('втрати машин:') + 1, lines.indexOf('втрати машин:') + 4);
  assert.deepEqual(lost.map((l) => l.slice(0, 4)), ['  A ', '  B ', '  C ']);
  assert.match(lines.find((l) => l.startsWith('замовлення виконано: ')) ?? '', /^замовлення виконано: A \d+, B \d+, C \d+ з \d+$/);
  assert.match(lines.find((l) => l.startsWith('кільце після зорі: ')) ?? '', /^кільце після зорі: A \d+, B \d+, C \d+$/);
});

test('replay writes a viewer page with every step-th frame of the match', () => {
  const dir = mkdtempSync(join(tmpdir(), 'replay-'));
  try {
    const out = join(dir, 'r.html');
    const r = run('replay.ts', ['--seed', '31', '--cast', CAST.join(','), '--match', '3', '--ticks', '60', '--step', '4', '--out', out], dir);
    assert.equal(r.code, 0, r.err);
    assert.equal(r.out, 'записано: ' + out + '\n');
    const html = readFileSync(out, 'utf8');
    assert.ok(!html.includes('__DATA__'));
    const want = direct(31, 3, 60);
    const title = 'Жереб 31, партія 3: ' + SLOTS.map((s) => want.slots[s]).join(' / ');
    assert.ok(html.includes(JSON.stringify(title)), 'title');
    const sub = 'Рахунок: ' + SLOTS.map((s) => want.slots[s] + ' ' + (want.score[s] ?? 0).toFixed(1)).join(', ') + '. Кольори: A бурштин, B бірюза, C фіолет.';
    assert.ok(html.includes(JSON.stringify(sub)), 'score line');
    const ts = [...html.matchAll(/\{"t":(\d+),"n":/g)].map((x) => Number(x[1]));
    assert.deepEqual(ts, [1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53, 57]);
    const cells = html.match(/"cells":\[(.*?)\]\],"finds"/)?.[1] ?? '';
    assert.equal(cells.split('],[').length, 3 * 19 * 20 + 1);
    const first = html.match(/\{"t":1,"n":\[.*?\],"u":\[.*?\],"m":\[([^\]]*)\],"e":\[([^\]]*)\],"d":(\d)/);
    assert.ok(first, 'first frame shape');
    assert.equal(first[1]?.split(',').length, 3);
    assert.equal(first[2]?.split(',').length, 3);
    assert.equal(first[3], '0');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
