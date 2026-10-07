import { nickOfSlot } from './names.ts';

interface Line {
  t: number;
  full?: boolean;
  own?: Record<string, string | null>;
  dark?: Record<string, boolean>;
  foe?: [string, string, number, number][];
}

export interface Belief {
  own: Map<string, string | null>;
  dark: Map<string, boolean>;
}

interface Contact {
  t: number;
  cell: string;
}

export class Diary {
  private readonly lines: Line[];
  private readonly fulls: number[];
  private readonly contacts = new Map<string, Contact[]>();
  private cacheT = -1;
  private cache: Belief = { own: new Map(), dark: new Map() };

  constructor(text: string) {
    this.lines = text
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as Line)
      .sort((a, b) => a.t - b.t);
    this.fulls = [];
    this.lines.forEach((l, i) => {
      if (l.full) this.fulls.push(i);
      for (const [id, , q, r] of l.foe ?? []) {
        const list = this.contacts.get(id) ?? [];
        list.push({ t: l.t, cell: q + ',' + r });
        this.contacts.set(id, list);
      }
    });
  }

  at(t: number): Belief {
    if (t === this.cacheT) return this.cache;
    let start = -1;
    for (const i of this.fulls) {
      const l = this.lines[i];
      if (l && l.t <= t) start = i;
      else break;
    }
    const own = new Map<string, string | null>();
    const dark = new Map<string, boolean>();
    if (start >= 0) {
      for (let i = start; i < this.lines.length; i++) {
        const l = this.lines[i];
        if (!l || l.t > t) break;
        for (const [k, v] of Object.entries(l.own ?? {})) own.set(k, v);
        for (const [k, v] of Object.entries(l.dark ?? {})) dark.set(k, v);
      }
    }
    this.cacheT = t;
    this.cache = { own, dark };
    return this.cache;
  }

  ownerAt(cell: string, t: number, roster: readonly string[]): string {
    const own = this.at(t).own;
    if (!own.has(cell)) return '?';
    const v = own.get(cell);
    return v === null || v === undefined ? '-' : nickOfSlot(roster, v);
  }

  lastContact(unit: string, t: number): number | null {
    const list = this.contacts.get(unit);
    if (!list) return null;
    let found: number | null = null;
    for (const c of list) {
      if (c.t <= t) found = c.t;
      else break;
    }
    return found;
  }

  ghost(unit: string, t: number): { cell: string; age: number } | null {
    const list = this.contacts.get(unit);
    if (!list) return null;
    let found: Contact | null = null;
    for (const c of list) {
      if (c.t <= t) found = c;
      else break;
    }
    return found ? { cell: found.cell, age: t - found.t } : null;
  }

  darkCount(t: number, needles: readonly string[]): number {
    const dark = this.at(t).dark;
    return needles.filter((k) => dark.get(k) === true).length;
  }
}
