import test from 'node:test';
import assert from 'node:assert/strict';
import { helpLines, parseCommand } from '../../src/client/terminal/commands.ts';

test('commands are case-insensitive and ignore surrounding whitespace', () => {
  assert.deepEqual(parseCommand('SHUTDOWN'), { kind: 'shutdown' });
  assert.deepEqual(parseCommand('  help  '), { kind: 'help' });
  assert.deepEqual(parseCommand('Status'), { kind: 'status' });
});

test('only the first word decides the command', () => {
  assert.deepEqual(parseCommand('status now please'), { kind: 'status' });
});

test('an empty line is empty, not unknown', () => {
  assert.deepEqual(parseCommand(''), { kind: 'empty' });
  assert.deepEqual(parseCommand('   '), { kind: 'empty' });
});

test('an unknown word is reported back in lower case', () => {
  assert.deepEqual(parseCommand('Reboot'), { kind: 'unknown', word: 'reboot' });
});

test('help lists every command and fits the 46-column screen', () => {
  const lines = helpLines();
  for (const name of ['HELP', 'STATUS', 'SHUTDOWN']) {
    assert.ok(lines.some((l) => l.startsWith(name)), `help mentions ${name}`);
  }
  for (const l of lines) assert.ok(Array.from(l).length <= 46);
});
