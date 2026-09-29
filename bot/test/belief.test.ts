import test from 'node:test';
import assert from 'node:assert/strict';
import { beliefLine } from '@zoria/sdk';
import { beliefFrame } from '../src/belief.ts';
import { World } from '../src/world.ts';
import { valleyOf } from './fixture.ts';
import { makeObs, tkach } from './obs.ts';

test('belief frame carries pulse, owners, dark needles, foes and units', () => {
  const w = new World(valleyOf('B'));
  const obs = makeObs({
    t: 9,
    mine: { ...makeObs().mine, needles: [{ q: 7, r: 5, dark: true, fed: false, weight: 0 }], units: [tkach('T-B6', 6, 6)] },
    foe: [{ id: 'K-A3', p: 'A', cls: 'клинок', q: 1, r: 1 }],
    noisy: [{ q: 3, r: 3 }],
  });
  w.update(obs);
  const f = beliefFrame(w, obs);
  assert.equal(f.t, 9);
  assert.equal(f.full, true);
  assert.equal(f.pulse.energy, 120);
  assert.equal(f.own?.['7,5'], 'B');
  assert.equal(f.dark?.['7,5'], true);
  assert.deepEqual(f.foe, [['K-A3', 'A', 1, 1]]);
  assert.equal(f.noisy, 1);
  assert.deepEqual(f.units, [['T-B6', 6, 6, 0]]);
  const line = beliefLine(f);
  assert.ok(line.endsWith('\n'));
  assert.equal(JSON.parse(line).t, 9);
});
