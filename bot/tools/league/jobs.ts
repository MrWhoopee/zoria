export type Trio = [string, string, string];

export interface Job {
  seed: number;
  cast: Trio;
}

export function trios(players: string[], pool: string[]): Trio[] {
  const all = [...new Set([...players, ...pool])];
  const mine = new Set(players);
  const seen = new Set<string>();
  const out: Trio[] = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      for (let k = j + 1; k < all.length; k++) {
        const t = [all[i], all[j], all[k]].filter((x): x is string => x !== undefined).sort();
        const [a, b, c] = t;
        if (a === undefined || b === undefined || c === undefined || !t.some((x) => mine.has(x))) continue;
        const id = t.join('|');
        if (seen.has(id)) continue;
        seen.add(id);
        out.push([a, b, c]);
      }
    }
  }
  return out.sort((x, y) => x.join('|').localeCompare(y.join('|')));
}

export function jobs(ts: Trio[], seeds: number[], fair = false): Job[] {
  const casts = fair ? ts.flatMap((t): Trio[] => [t, [t[2], t[1], t[0]]]) : ts;
  return casts.flatMap((cast) => seeds.map((seed) => ({ seed, cast })));
}

export function pending(all: Job[], done: { seed: number; cast: Trio }[]): Job[] {
  const seen = new Set(done.map((d) => d.seed + '|' + d.cast.join('|')));
  return all.filter((j) => !seen.has(j.seed + '|' + j.cast.join('|')));
}
