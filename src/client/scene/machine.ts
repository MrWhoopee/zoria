export type SceneState =
  | 'dark' | 'lightsOn' | 'screenOn' | 'zoomIn' | 'working'
  | 'stepBack' | 'room' | 'notebookOpen' | 'notebook' | 'notebookClose'
  | 'zoomOut' | 'screenOff' | 'lightsOff';

export type SceneEvent =
  | { type: 'press' } | { type: 'shutdown' } | { type: 'stepDone' }
  | { type: 'stepBack' } | { type: 'approach' } | { type: 'openNotebook' } | { type: 'closeNotebook' };

export type CrtPhase = 'off' | 'booting' | 'on' | 'shutting';

const NEXT: Partial<Record<SceneState, SceneState>> = {
  lightsOn: 'screenOn',
  screenOn: 'zoomIn',
  zoomIn: 'working',
  stepBack: 'room',
  notebookOpen: 'notebook',
  notebookClose: 'room',
  zoomOut: 'screenOff',
  screenOff: 'lightsOff',
  lightsOff: 'dark',
};

const STEP_MS: Partial<Record<SceneState, number>> = {
  lightsOn: 1500,
  screenOn: 1800,
  zoomIn: 1300,
  stepBack: 1300,
  notebookOpen: 650,
  notebookClose: 450,
  zoomOut: 1300,
  screenOff: 500,
  lightsOff: 700,
};

const SCREEN_ON = new Set<SceneState>(['zoomIn', 'working', 'zoomOut', 'stepBack', 'room', 'notebookOpen', 'notebook', 'notebookClose']);

export function reduceScene(state: SceneState, event: SceneEvent): SceneState {
  switch (event.type) {
    case 'press': return state === 'dark' ? 'lightsOn' : state;
    case 'shutdown': return state === 'working' ? 'zoomOut' : state === 'room' ? 'screenOff' : state;
    case 'stepBack': return state === 'working' ? 'stepBack' : state;
    case 'approach': return state === 'room' ? 'zoomIn' : state;
    case 'openNotebook': return state === 'room' ? 'notebookOpen' : state;
    case 'closeNotebook': return state === 'notebook' ? 'notebookClose' : state;
    case 'stepDone': return NEXT[state] ?? state;
  }
}

export function stepDuration(state: SceneState, reducedMotion: boolean): number | null {
  const ms = STEP_MS[state];
  if (ms === undefined) return null;
  return reducedMotion ? 0 : ms;
}

export function isLit(s: SceneState): boolean {
  return s !== 'dark' && s !== 'lightsOff';
}

export function isZoomed(s: SceneState): boolean {
  return s === 'zoomIn' || s === 'working';
}

export function acceptsInput(s: SceneState): boolean {
  return s === 'working';
}

export function inRoom(s: SceneState): boolean {
  return s === 'room';
}

export function notebookShown(s: SceneState): boolean {
  return s === 'notebookOpen' || s === 'notebook' || s === 'notebookClose';
}

export function crtPhase(s: SceneState): CrtPhase {
  if (s === 'screenOn') return 'booting';
  if (SCREEN_ON.has(s)) return 'on';
  if (s === 'screenOff') return 'shutting';
  return 'off';
}
