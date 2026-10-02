import test from 'node:test';
import assert from 'node:assert/strict';
import { hexDist, toHex, toPx } from '../../src/arena/geometry.ts';

test('pixel to hex inverts hex to pixel across the valley, including off-centre clicks', () => {
  for (let q = -19; q <= 19; q++) {
    for (let r = -19; r <= 19; r++) {
      if ((Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2 > 19) continue;
      const [x, y] = toPx(q, r, 12, 450, 450);
      assert.deepEqual(toHex(x, y, 12, 450, 450), { q, r });
      assert.deepEqual(toHex(x + 5, y - 4, 12, 450, 450), { q, r });
    }
  }
  assert.equal(hexDist({ q: 0, r: 0 }, { q: 3, r: -1 }), 3);
});
