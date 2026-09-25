export type Command =
  | { kind: 'empty' } | { kind: 'help' } | { kind: 'status' } | { kind: 'letter' }
  | { kind: 'parts' } | { kind: 'repo' } | { kind: 'roll' } | { kind: 'login' } | { kind: 'logout' }
  | { kind: 'ack'; n: number | null }
  | { kind: 'mail'; n: number | null }
  | { kind: 'news'; n: number | null }
  | { kind: 'shutdown' }
  | { kind: 'unknown'; word: string };

const SIMPLE = new Set(['help', 'status', 'letter', 'parts', 'repo', 'roll', 'login', 'logout', 'shutdown'] as const);
type Simple = typeof SIMPLE extends Set<infer T> ? T : never;

function number(s: string): number | null {
  if (!/^\d+$/.test(s)) return null;
  const n = Number.parseInt(s, 10);
  return n > 0 ? n : null;
}

export function parseCommand(raw: string): Command {
  const [first = '', second = ''] = raw.trim().split(/\s+/);
  const word = first.toLowerCase();
  if (word === '') return { kind: 'empty' };
  if (SIMPLE.has(word as Simple)) return { kind: word as Simple };
  if (word === 'ack' || word === 'mail' || word === 'news') return { kind: word, n: number(second) };
  return { kind: 'unknown', word };
}

export function helpLines(): string[] {
  return [
    'HELP      this list',
    'STATUS    ether, session, mail, parts',
    'PARTS     released parts of the task',
    'ACK N     acknowledge receipt of part N',
    'MAIL      letters;  MAIL N  read letter N',
    'NEWS      news;  NEWS N  read item N',
    'REPO      repository and access status',
    'LETTER    the keeper\'s letter',
    'ROLL      the roll call',
    'LOGIN     sign in again',
    'LOGOUT    end the session',
    'SHUTDOWN  power off the terminal',
    '',
    '↑ ↓ PgUp PgDn Home End  scroll',
    'Esc  back;  Esc again  step back',
  ];
}
