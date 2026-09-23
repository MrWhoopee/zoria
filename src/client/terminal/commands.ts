export type Command =
  | { kind: 'empty' }
  | { kind: 'help' }
  | { kind: 'status' }
  | { kind: 'letter'; page: number }
  | { kind: 'shutdown' }
  | { kind: 'unknown'; word: string };

export function parseCommand(raw: string): Command {
  const [first = '', second = ''] = raw.trim().split(/\s+/);
  const word = first.toLowerCase();
  if (word === '') return { kind: 'empty' };
  if (word === 'help') return { kind: 'help' };
  if (word === 'status') return { kind: 'status' };
  if (word === 'letter') {
    const page = Number.parseInt(second, 10);
    return { kind: 'letter', page: Number.isInteger(page) && page > 0 ? page : 1 };
  }
  if (word === 'shutdown') return { kind: 'shutdown' };
  return { kind: 'unknown', word };
}

export function helpLines(): string[] {
  return [
    'HELP      list commands',
    'STATUS    ether and registration',
    'LETTER N  read the keeper\'s letter, page N',
    'SHUTDOWN  power off the terminal',
  ];
}
