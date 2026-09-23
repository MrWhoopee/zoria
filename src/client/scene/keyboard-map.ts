import { fromPhoto } from './geometry.ts';
import type { Quad } from './keys.ts';

type Band = { top: number; bottom: number };
type Cap = [code: string, x0: number, x1: number];

const R1: Band = { top: 353.5, bottom: 362.5 };
const R2: Band = { top: 363.5, bottom: 371.5 };
const R3: Band = { top: 372.5, bottom: 380.5 };
const R4: Band = { top: 381.5, bottom: 390.5 };
const R5: Band = { top: 391.5, bottom: 405 };

const pitch = (codes: string[], x0: number, step: number, width: number): Cap[] =>
  codes.map((code, i) => [code, x0 + i * step, x0 + i * step + width]);

const ROWS: Array<[Band, Cap[]]> = [
  [R1, [
    ['Escape', 389, 400.5],
    ...pitch(['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'], 404, 14.67, 13),
    ['Backspace', 595, 621],
    ['Delete', 625, 638],
  ]],
  [R2, [
    ['Tab', 387.5, 407],
    ...pitch(['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'], 410, 14.95, 12.5),
    ['PageUp', 604, 622],
  ]],
  [R3, [
    ['CapsLock', 385.5, 410],
    ...pitch(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'], 412, 15, 13),
    ['Enter', 593, 624],
  ]],
  [R4, [
    ['ShiftLeft', 383.5, 416],
    ...pitch(['IntlBackslash', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'], 419, 15.3, 12.5),
    ['ShiftRight', 586, 610],
    ['ArrowUp', 614, 626],
  ]],
  [R5, [
    ['ControlLeft', 381.5, 400],
    ['AltLeft', 421, 439],
    ['Space', 443, 555],
    ['AltRight', 559, 578],
    ['ArrowLeft', 599, 612],
    ['ArrowDown', 615, 627],
    ['ArrowRight', 628.5, 645],
  ]],
];

const EXTRA: Array<[string, number, number, number, number]> = [
  ['PageDown', 626, 637.5, 363.5, 377],
];

const box = (x0: number, x1: number, y0: number, y1: number): Quad =>
  [fromPhoto(x0, y0), fromPhoto(x1, y0), fromPhoto(x1, y1), fromPhoto(x0, y1)];

export const KEYBOARD: ReadonlyMap<string, Quad> = new Map([
  ...ROWS.flatMap(([band, caps]) => caps.map(([code, x0, x1]): [string, Quad] => [code, box(x0, x1, band.top, band.bottom)])),
  ...EXTRA.map(([code, x0, x1, y0, y1]): [string, Quad] => [code, box(x0, x1, y0, y1)]),
]);
