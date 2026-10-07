import { execFileSync } from 'node:child_process';

export interface Line {
  n: number;
  text: string;
}

export interface Finding {
  rule: string;
  path: string;
  line: number;
}

const SHAPED: { rule: string; re: RegExp }[] = [
  { rule: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { rule: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/ },
  { rule: 'npm-token', re: /\bnpm_[A-Za-z0-9]{36,}\b/ },
  { rule: 'aws-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { rule: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
];

const NPMRC = /_auth(?:Token)?\s*=\s*(\S+)/;
const ASSIGNED = /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token)\b["']?\s*[:=]\s*(['"`])([^'"`]*)\1/i;
const STUBS = /^(?:changeme|change[_-]?me|example|placeholder|dummy|secret|password|xxx+|\*+|\.+)$/i;
const TEST_DIR = /(?:^|\/)(?:test|tests|__tests__|__mocks__|e2e)\//;
const TEST_FILE = /\.(?:test|spec)\.[^/]+$/;

function isTestPath(path: string): boolean {
  return TEST_DIR.test(path) || TEST_FILE.test(path);
}

function isPlaceholder(value: string): boolean {
  return value === '' || /\s/.test(value) || value.includes('${') || /^<.*>$/.test(value) || STUBS.test(value);
}

export function scanLines(path: string, lines: Line[]): Finding[] {
  const out: Finding[] = [];
  for (const { n, text } of lines) {
    const shaped = SHAPED.find((s) => s.re.test(text));
    if (shaped) {
      out.push({ rule: shaped.rule, path, line: n });
      continue;
    }
    if (/(?:^|\/)\.npmrc$/.test(path)) {
      const m = NPMRC.exec(text);
      if (m && !(m[1] ?? '').startsWith('${')) out.push({ rule: 'npmrc-secret', path, line: n });
      continue;
    }
    if (isTestPath(path)) continue;
    const m = ASSIGNED.exec(text);
    if (m && !isPlaceholder(m[2] ?? '')) out.push({ rule: 'hardcoded-secret', path, line: n });
  }
  return out;
}

export function addedLines(diff: string): { path: string; lines: Line[] }[] {
  const out: { path: string; lines: Line[] }[] = [];
  let cur: { path: string; lines: Line[] } | null = null;
  let n = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      cur = null;
      continue;
    }
    if (raw.startsWith('+++ ')) {
      const p = raw.slice(4).trim();
      cur = p === '/dev/null' ? null : { path: p.replace(/^b\//, ''), lines: [] };
      if (cur) out.push(cur);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      n = Number(hunk[1]);
      continue;
    }
    if (!cur) continue;
    if (raw.startsWith('+')) {
      cur.lines.push({ n, text: raw.slice(1) });
      n++;
    } else if (raw.startsWith(' ')) n++;
  }
  return out.filter((f) => f.lines.length > 0);
}

const ZERO = /^0+$/;

function rangeDiff(local: string, remote: string): string {
  const args = ZERO.test(remote) ? ['log', '-p', '-U0', '--no-color', '--format=', local, '--not', '--remotes'] : ['log', '-p', '-U0', '--no-color', '--format=', remote + '..' + local];
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function main(input: string): number {
  const findings: Finding[] = [];
  for (const row of input.split('\n')) {
    const [, local, , remote] = row.trim().split(/\s+/);
    if (!local || !remote || ZERO.test(local)) continue;
    for (const f of addedLines(rangeDiff(local, remote))) findings.push(...scanLines(f.path, f.lines));
  }
  for (const f of findings) process.stderr.write('secret-scan: ' + f.rule + ' at ' + f.path + ':' + f.line + '\n');
  if (findings.length > 0) process.stderr.write('secret-scan: push blocked, ' + findings.length + ' finding(s)\n');
  return findings.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop() ?? '')) {
  const chunks: Buffer[] = [];
  process.stdin.on('data', (c: Buffer) => chunks.push(c));
  process.stdin.on('end', () => {
    process.exitCode = main(Buffer.concat(chunks).toString('utf8'));
  });
}
