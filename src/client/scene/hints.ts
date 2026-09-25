import type { SceneState } from './machine.ts';

const HINTS: Partial<Record<SceneState, string>> = {
  working: 'Esc  step back',
  room: 'Enter / click the screen  terminal  ·  notebook  ·  red button  power off',
  notebook: '← →  turn page  ·  Esc  put down',
};

export function hintFor(s: SceneState): string | null {
  return HINTS[s] ?? null;
}
