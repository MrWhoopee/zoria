import test from 'node:test';
import assert from 'node:assert/strict';
import { hintFor } from '../../src/client/scene/hints.ts';

test('each resting state names its keys; transitions show nothing', () => {
  assert.equal(hintFor('working'), 'Esc  step back');
  assert.match(hintFor('room') ?? '', /notebook/);
  assert.match(hintFor('notebook') ?? '', /turn page/);
  assert.equal(hintFor('zoomIn'), null);
  assert.equal(hintFor('dark'), null);
});
