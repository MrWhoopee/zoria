import test from 'node:test';
import assert from 'node:assert/strict';
import { Links } from '../src/map/links.ts';
import { valleyOf } from './fixture.ts';

test('links respect range and memoize oracle calls', () => {
  const v = valleyOf('A');
  let calls = 0;
  const links = new Links({ linkOk: () => { calls++; return true; } }, v);
  assert.equal(links.ok({ q: 0, r: 0 }, { q: 0, r: 7 }), false);
  assert.equal(calls, 0);
  assert.equal(links.ok({ q: 0, r: 0 }, { q: 0, r: 5 }), true);
  assert.equal(links.ok({ q: 0, r: 5 }, { q: 0, r: 0 }), true);
  assert.equal(calls, 1);
});

test('reach is true when any anchor links', () => {
  const v = valleyOf('A');
  const links = new Links({ linkOk: (a, b) => a.q === 0 && b.q === 0 }, v);
  assert.equal(links.reach({ q: 0, r: 4 }, [{ q: 3, r: 0 }, { q: 0, r: 0 }]), true);
  assert.equal(links.reach({ q: 1, r: 4 }, [{ q: 0, r: 0 }]), false);
  assert.equal(links.reach({ q: 0, r: 4 }, []), false);
});
