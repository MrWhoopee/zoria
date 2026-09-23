import { fromPhoto } from './geometry.ts';
import { layoutKeyboard, type KeyRow } from './keys.ts';

const row = (x0: number, x1: number, yTop: number, yBottom: number, keys: KeyRow['keys']): KeyRow => ({
  quad: [fromPhoto(x0 + 1, yTop), fromPhoto(x1 - 1, yTop), fromPhoto(x1, yBottom), fromPhoto(x0, yBottom)],
  keys,
});

const plain = (codes: string[]): KeyRow['keys'] => codes.map((code) => ({ code }));

export const KEY_ROWS: KeyRow[] = [
  row(388, 640, 352, 362, [
    ...plain(['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal']),
    { code: 'Backspace', weight: 2 },
  ]),
  row(386, 641, 363, 373, [
    { code: 'Tab', weight: 1.5 },
    ...plain(['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight']),
    { code: 'Backslash', weight: 1.5 },
  ]),
  row(385, 642, 374, 384, [
    { code: 'CapsLock', weight: 1.75 },
    ...plain(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote']),
    { code: 'Enter', weight: 2.25 },
  ]),
  row(384, 643, 385, 395, [
    { code: 'ShiftLeft', weight: 2.25 },
    ...plain(['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash']),
    { code: 'ShiftRight', weight: 2.75 },
  ]),
  row(448, 585, 396, 405, [{ code: 'Space' }]),
];

export const KEYBOARD = layoutKeyboard(KEY_ROWS);
