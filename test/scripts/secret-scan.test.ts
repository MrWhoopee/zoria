import test from 'node:test';
import assert from 'node:assert/strict';
import { addedLines, scanLines } from '../../scripts/secret-scan.ts';

const gh = 'gh' + 'p_' + 'A1b2C3d4'.repeat(5);
const npm = 'np' + 'm_' + 'Z9y8X7w6'.repeat(5);
const aws = 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP';
const slack = 'xo' + 'xb-' + '1234567890-abcdefghij';
const key = '-----BEGIN ' + 'RSA PRIVATE KEY-----';

test('token-shaped secrets are caught on any path, test paths included', () => {
  for (const [line, rule] of [[`const t = '${gh}';`, 'github-token'], [`TOKEN=${npm}`, 'npm-token'], [`id: ${aws}`, 'aws-key'], [`hook ${slack}`, 'slack-token'], [key, 'private-key']] as const) {
    assert.deepEqual(scanLines('src/x.ts', [{ n: 3, text: line }]).map((f) => f.rule), [rule], line);
    assert.deepEqual(scanLines('test/x.test.ts', [{ n: 3, text: line }]).map((f) => f.rule), [rule], line);
  }
});

test('a registry secret written into .npmrc is caught, a variable reference is not', () => {
  const written = '//npm.zoria.net/:_au' + 'th=' + 'QWxh' + 'ZGRp' + 'bjpv' + 'cGVu';
  assert.deepEqual(scanLines('.npmrc', [{ n: 2, text: written }]).map((f) => f.rule), ['npmrc-secret']);
  assert.deepEqual(scanLines('bot/.npmrc', [{ n: 2, text: '//npm.zoria.net/:_auth=${ZORIA_NPM_AUTH}' }]), []);
});

test('a password assigned as a string is caught outside test paths only', () => {
  const line = "const password = 'hunter2hunter2';";
  assert.deepEqual(scanLines('src/agent/login.ts', [{ n: 7, text: line }]).map((f) => [f.rule, f.path, f.line]), [['hardcoded-secret', 'src/agent/login.ts', 7]]);
  for (const p of ['test/agent/login.test.ts', 'bot/tests/a.ts', 'e2e/x.ts', 'src/__mocks__/m.ts', 'src/x.spec.ts']) assert.deepEqual(scanLines(p, [{ n: 7, text: line }]), [], p);
});

test('placeholders, values with spaces and variable references are not secrets', () => {
  for (const line of ["password: 'From 12 to 256 characters.'", 'password: process.env.PASS', "password = ''", "secret: '${ZORIA_NPM_AUTH}'", "password: '<your password>'", "password: 'changeme'"]) {
    assert.deepEqual(scanLines('src/a.ts', [{ n: 1, text: line }]), [], line);
  }
});

test('added lines are read from a unified diff with their new line numbers', () => {
  const diff = ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1,2 +10,3 @@', ' keep', '+added one', '-gone', '+added two', 'diff --git a/x.bin b/x.bin', '+++ /dev/null', '@@ -1 +0,0 @@', '-old'].join('\n');
  assert.deepEqual(addedLines(diff), [{ path: 'src/a.ts', lines: [{ n: 11, text: 'added one' }, { n: 12, text: 'added two' }] }]);
});
