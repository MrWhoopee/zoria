import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, mutants } from '../tools/mutate/ops.ts';

test('binary operators with spaces are mutated, generics and arrows are not', () => {
  const src = "const m = new Map<string, number>();\nconst f = (a: number): boolean => a < 3 && a >= 1;\n";
  const ms = mutants(src);
  const kinds = ms.map((m) => m.from + '>' + m.to);
  assert.ok(kinds.includes('<><='));
  assert.ok(kinds.includes('>=>>'));
  assert.ok(kinds.includes('&&>||'));
  assert.ok(ms.every((m) => m.line === 2));
  assert.ok(!kinds.some((k) => k.startsWith('=>')));
});

test('strings are left alone and numbers shift by one', () => {
  const src = "const s = 'a < b';\nconst n = 3 + x;\n";
  const ms = mutants(src);
  assert.ok(ms.every((m) => m.line === 2));
  assert.ok(ms.some((m) => m.from === '3' && m.to === '4'));
  assert.ok(ms.some((m) => m.from === '+' && m.to === '-'));
});

test('apply replaces exactly the mutated span', () => {
  const src = 'if (a === b && c) return true;';
  const eq = mutants(src).find((m) => m.from === '===');
  assert.ok(eq);
  assert.equal(apply(src, eq), 'if (a !== b && c) return true;');
  const t = mutants(src).find((m) => m.from === 'true');
  assert.ok(t);
  assert.equal(apply(src, t), 'if (a === b && c) return false;');
});
