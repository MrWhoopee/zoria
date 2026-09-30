import test from 'node:test';
import assert from 'node:assert/strict';
import { dist, keyOf } from '../src/hex.ts';
import { gain } from '../src/map/coverage.ts';
import { cfg } from '../src/map/valley.ts';
import { expand, sites, unlockValue } from '../src/plans/expand.ts';
import { ctxOf } from './ctx.ts';
import { makeObs, tkach } from './obs.ts';

const probe = ctxOf('A', makeObs());
const outer = probe.v.ring.filter((r) => dist(r, probe.v.citadel) === probe.v.cherta);
const pair = outer.flatMap((ring) => probe.v.cells.filter((c) => dist(c, probe.v.citadel) >= probe.v.cherta + 3 && dist(c, probe.v.citadel) <= 11 && probe.links.ok(c, ring)).map((c) => ({ ring, near: c })))[0];

function ctxAt(t: number, units = [tkach('T-A6', 6, -12)]) {
  if (!pair) throw new Error('no ring pair');
  const needles = [{ q: 5, r: -12, dark: false, fed: false, weight: 1 }, { q: 7, r: -13, dark: false, fed: false, weight: 1 }, { q: pair.near.q, r: pair.near.r, dark: false, fed: false, weight: 1 }];
  return ctxOf('A', makeObs({ t, pulse: { ...makeObs().pulse, energy: 0 }, pub: { ...makeObs().pub, dawn: t >= 1000 }, mine: { ...makeObs().mine, needles, units } }));
}

test('after dawn a linked ring needle is worth double pull', () => {
  assert.ok(pair);
  const ctx = ctxAt(1010);
  const anchors = [ctx.v.base, ...ctx.w.ownLit()];
  const s = sites(ctx, anchors, new Map(), new Map(), new Set()).find((x) => keyOf(x.cell) === keyOf(pair.ring));
  assert.ok(s);
  assert.equal(s.work, cfg(ctx.v, 'heatNeedle'));
  assert.ok(Math.abs(s.gain - gain(ctx.v, pair.ring, new Map(), new Map(), cfg(ctx.v, 'dawnRing'))) < 1e-9);
});

test('before dawn a build that reaches the ring gains value only in the prep window', () => {
  assert.ok(pair);
  const ring = pair.ring;
  const site = probe.v.cells.find((c) => dist(c, probe.v.citadel) > probe.v.cherta && probe.links.ok(c, ring) && !probe.links.ok(pair.near, c) === false);
  assert.ok(site);
  const early = ctxAt(300);
  const late = ctxAt(900);
  const anchorsE = [early.v.base, { q: 5, r: -12 }, { q: 7, r: -13 }];
  const anchorsL = [late.v.base, { q: 5, r: -12 }, { q: 7, r: -13 }];
  assert.equal(unlockValue(early, site, anchorsE, new Map(), new Map()) >= 0, true);
  assert.ok(unlockValue(late, site, anchorsL, new Map(), new Map()) > unlockValue(early, site, anchorsE, new Map(), new Map()));
});

test('just before dawn a free Tkach waits outside the line next to a reachable ring needle', () => {
  assert.ok(pair);
  const ctx = ctxAt(975, [tkach('T-A6', pair.near.q, pair.near.r)]);
  const o = expand(ctx).find((t) => t.tag === 'expand:stage')?.order;
  assert.ok(o && o.kind === 'move');
  const at = { q: o.q, r: o.r };
  assert.equal(dist(at, ctx.v.citadel), ctx.v.cherta + 1);
  assert.ok(ctx.v.ring.some((r) => dist(at, r) <= 2));
});
