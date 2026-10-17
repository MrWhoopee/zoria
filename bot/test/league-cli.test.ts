import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRecords, report } from '../tools/league/report.ts';

const tool = (name: string): string => fileURLToPath(new URL('../tools/' + name, import.meta.url));

function run(name: string, args: string[], cwd: string): { code: number | null; out: string; err: string } {
  const r = spawnSync(process.execPath, [tool(name), ...args], { cwd, encoding: 'utf8', timeout: 120000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const ARGS = ['--players', 'глушій-7', '--pool', 'рівний,шир', '--seeds', '1', '--from', '7', '--ticks', '120', '--workers', '1'];

test('a fair league plays every trio in both orders, saves each pack and resumes without replaying', () => {
  const dir = mkdtempSync(join(tmpdir(), 'league-'));
  try {
    const file = join(dir, 'run.ndjson');
    const first = run('league.ts', [...ARGS, '--fair', '--resume', file], dir);
    assert.equal(first.code, 0, first.err);
    assert.match(first.out, /ліга: 2 пакетів \(уже зіграно 0\), 1 працівників, тактів 120, записи: /);
    const records = readRecords(readFileSync(file, 'utf8'));
    assert.equal(records.length, 2);
    assert.deepEqual(records.map((r) => r.cast.join(',')).sort(), ['глушій-7,рівний,шир', 'шир,рівний,глушій-7']);
    for (const r of records) {
      assert.equal(r.seed, 7);
      assert.equal(r.shares.reduce((a, b) => a + b, 0), 18);
      assert.equal(r.matches.length, 3);
      for (const m of r.matches) {
        assert.equal(m.score.length, 3);
        assert.equal(m.breakdown.length, 3);
        m.breakdown.forEach((b, i) => {
          assert.ok(b.network >= 0 && b.orders >= 0 && b.stolen >= 0 && b.jams >= 0 && b.rams >= 0 && b.pactTax >= 0);
          assert.ok(Math.abs((m.score[i] ?? 0) - b.network - b.orders + b.pactTax) < 1e-6, 'score is network + orders - tax');
        });
      }
    }
    const tail = first.out.split('\n').slice(first.out.split('\n').indexOf('пакетів: 2'));
    assert.deepEqual(tail.filter((l) => l.length > 0), report(records, ['глушій-7']).filter((l) => l.length > 0));
    const again = run('league.ts', [...ARGS, '--fair', '--resume', file], dir);
    assert.equal(again.code, 0, again.err);
    assert.match(again.out, /ліга: 0 пакетів \(уже зіграно 2\)/);
    assert.equal(readRecords(readFileSync(file, 'utf8')).length, 2);
    const plain = run('league.ts', ARGS, dir);
    assert.equal(plain.code, 0, plain.err);
    assert.match(plain.out, /ліга: 1 пакетів \(уже зіграно 0\)/);
    assert.ok(existsSync(join(dir, 'league')));
    const shown = run('league-report.ts', [file], dir);
    assert.equal(shown.code, 0, shown.err);
    assert.deepEqual(shown.out.split('\n').filter((l) => l.length > 0), report(records, ['глушій-7']).filter((l) => l.length > 0));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a league refuses a bad number and an unknown participant', () => {
  const dir = mkdtempSync(join(tmpdir(), 'league-'));
  try {
    const bad = run('league.ts', ['--players', 'глушій-7', '--pool', 'рівний,шир', '--seeds', '1.5'], dir);
    assert.notEqual(bad.code, 0);
    assert.match(bad.err, /--seeds must be a whole number, got 1\.5/);
    const who = run('league.ts', ['--players', 'глушій-7', '--pool', 'хтозна,шир'], dir);
    assert.notEqual(who.code, 0);
    assert.match(who.err, /unknown participant хтозна/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
