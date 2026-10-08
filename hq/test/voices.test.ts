import test from 'node:test';
import assert from 'node:assert/strict';
import { Gate, answerSound, bytesOfDataUrl, flapBursts, seekSound } from '../src/sound/voices.ts';

test('the gate lets one sound through per interval', () => {
  const g = new Gate(100);
  assert.equal(g.pass(0), true);
  assert.equal(g.pass(50), false);
  assert.equal(g.pass(99), false);
  assert.equal(g.pass(100), true);
  assert.equal(g.pass(150), false);
  assert.equal(g.pass(260), true);
});

test('a short move clicks, a long one spools the tape, none is silent', () => {
  assert.equal(seekSound(10, 10), 'none');
  assert.equal(seekSound(10, 11), 'tick');
  assert.equal(seekSound(40, 10), 'tick');
  assert.equal(seekSound(0, 31), 'spool');
  assert.equal(seekSound(900, 0), 'spool');
});

test('the lever answer rings on 200, buzzes on a refusal, waits silently', () => {
  assert.equal(answerSound('200'), 'bell');
  assert.equal(answerSound('409'), 'buzz');
  assert.equal(answerSound('503'), 'buzz');
  assert.equal(answerSound('400'), 'buzz');
  assert.equal(answerSound('err'), 'buzz');
  assert.equal(answerSound('…'), null);
  assert.equal(answerSound(''), null);
  assert.equal(answerSound('-'), null);
});

test('flaps clatter in at most three bursts', () => {
  assert.equal(flapBursts(0), 0);
  assert.equal(flapBursts(1), 1);
  assert.equal(flapBursts(2), 2);
  assert.equal(flapBursts(9), 3);
});

test('an inlined data url turns back into its bytes without a request', () => {
  assert.deepEqual([...bytesOfDataUrl('data:audio/ogg;base64,AAEC/w==')], [0, 1, 2, 255]);
  assert.deepEqual([...bytesOfDataUrl('data:audio/ogg,abc')], [97, 98, 99]);
  assert.equal(bytesOfDataUrl('not a data url').length, 0);
});
