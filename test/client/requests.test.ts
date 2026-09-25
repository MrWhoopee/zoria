import test from 'node:test';
import assert from 'node:assert/strict';
import { latest } from '../../src/client/terminal/requests.ts';

test('only the newest ticket is current, so a late reply cannot overwrite a newer screen', () => {
  const l = latest();
  const first = l.next();
  const second = l.next();
  assert.equal(l.isCurrent(first), false);
  assert.equal(l.isCurrent(second), true);
});
