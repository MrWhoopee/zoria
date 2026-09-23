export type Command =
  | { kind: 'empty' }
  | { kind: 'help' }
  | { kind: 'status' }
  | { kind: 'shutdown' }
  | { kind: 'unknown'; word: string };

export function parseCommand(raw: string): Command {
  const word = raw.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (word === '') return { kind: 'empty' };
  if (word === 'help') return { kind: 'help' };
  if (word === 'status') return { kind: 'status' };
  if (word === 'shutdown') return { kind: 'shutdown' };
  return { kind: 'unknown', word };
}

export function helpLines(): string[] {
  return [
    'HELP      list commands',
    'STATUS    ether and registration',
    'SHUTDOWN  power off the terminal',
  ];
}
