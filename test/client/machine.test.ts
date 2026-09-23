import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptsInput, crtPhase, isLit, isZoomed, reduceScene, stepDuration,
  type SceneEvent, type SceneState,
} from '../../src/client/scene/machine.ts';

function run(start: SceneState, events: SceneEvent['type'][]): SceneState[] {
  const seen: SceneState[] = [];
  let s = start;
  for (const type of events) { s = reduceScene(s, { type } as SceneEvent); seen.push(s); }
  return seen;
}

test('the button powers up: light, screen, zoom, then work', () => {
  assert.deepEqual(run('dark', ['press', 'stepDone', 'stepDone', 'stepDone']),
    ['lightsOn', 'screenOn', 'zoomIn', 'working']);
});

test('shutdown mirrors it: zoom out, screen, light, then dark', () => {
  assert.deepEqual(run('working', ['shutdown', 'stepDone', 'stepDone', 'stepDone']),
    ['zoomOut', 'screenOff', 'lightsOff', 'dark']);
});

test('pressing the button again mid-sequence does not start a second one', () => {
  for (const s of ['lightsOn', 'screenOn', 'zoomIn', 'working', 'zoomOut', 'screenOff', 'lightsOff'] as const) {
    assert.equal(reduceScene(s, { type: 'press' }), s, `press in ${s}`);
  }
});

test('shutdown only works once the terminal is working', () => {
  for (const s of ['dark', 'lightsOn', 'screenOn', 'zoomIn', 'zoomOut', 'screenOff', 'lightsOff'] as const) {
    assert.equal(reduceScene(s, { type: 'shutdown' }), s, `shutdown in ${s}`);
  }
});

test('a stray step timer in a resting state changes nothing', () => {
  assert.equal(reduceScene('dark', { type: 'stepDone' }), 'dark');
  assert.equal(reduceScene('working', { type: 'stepDone' }), 'working');
});

test('resting states have no step timer; transitions do', () => {
  assert.equal(stepDuration('dark', false), null);
  assert.equal(stepDuration('working', false), null);
  for (const s of ['lightsOn', 'screenOn', 'zoomIn', 'zoomOut', 'screenOff', 'lightsOff'] as const) {
    assert.ok((stepDuration(s, false) ?? 0) > 0, s);
  }
});

test('reduced motion makes every transition instant', () => {
  for (const s of ['lightsOn', 'screenOn', 'zoomIn', 'zoomOut', 'screenOff', 'lightsOff'] as const) {
    assert.equal(stepDuration(s, true), 0, s);
  }
});

test('flags follow the sequence', () => {
  const table: Array<[SceneState, boolean, boolean, boolean, string]> = [
    ['dark', false, false, false, 'off'],
    ['lightsOn', true, false, false, 'off'],
    ['screenOn', true, false, false, 'booting'],
    ['zoomIn', true, true, false, 'on'],
    ['working', true, true, true, 'on'],
    ['zoomOut', true, false, false, 'on'],
    ['screenOff', true, false, false, 'shutting'],
    ['lightsOff', false, false, false, 'off'],
  ];
  for (const [s, lit, zoomed, input, crt] of table) {
    assert.equal(isLit(s), lit, `lit ${s}`);
    assert.equal(isZoomed(s), zoomed, `zoomed ${s}`);
    assert.equal(acceptsInput(s), input, `input ${s}`);
    assert.equal(crtPhase(s), crt, `crt ${s}`);
  }
});
