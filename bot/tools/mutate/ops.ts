export interface Mutant {
  at: number;
  from: string;
  to: string;
  line: number;
}

const SWAPS: [RegExp, (s: string) => string | null][] = [
  [/ (===|!==|<=|>=|<|>|&&|\|\||\+|-|\*|\/) /y, (s) => ({ '===': '!==', '!==': '===', '<=': '<', '>=': '>', '<': '<=', '>': '>=', '&&': '||', '||': '&&', '+': '-', '-': '+', '*': '/', '/': '*' })[s.trim()] ?? null],
  [/\b(true|false)\b/y, (s) => (s === 'true' ? 'false' : 'true')],
  [/\bMath\.(max|min)\b/y, (s) => (s === 'Math.max' ? 'Math.min' : 'Math.max')],
  [/\b\d+(\.\d+)?\b/y, (s) => String(Number(s) + 1)],
];

export function mutants(src: string): Mutant[] {
  const out: Mutant[] = [];
  let line = 1;
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i] ?? '';
    if (ch === '\n') line++;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    const prev = src[i - 1] ?? ' ';
    for (const [re, swap] of SWAPS) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (!m) continue;
      if (/\w/.test(prev) && re !== SWAPS[0]?.[0]) continue;
      const text = m[0];
      const core = text.trim();
      const to = swap(core);
      if (to === null || to === core) continue;
      const at = i + text.indexOf(core);
      out.push({ at, from: core, to, line });
    }
  }
  return out;
}

export function apply(src: string, m: Mutant): string {
  return src.slice(0, m.at) + m.to + src.slice(m.at + m.from.length);
}
