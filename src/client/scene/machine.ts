export type SceneState =
  | 'dark' | 'lightsOn' | 'screenOn' | 'zoomIn' | 'working'
  | 'zoomOut' | 'screenOff' | 'lightsOff';

export type SceneEvent = { type: 'press' } | { type: 'shutdown' } | { type: 'stepDone' };

export type CrtPhase = 'off' | 'booting' | 'on' | 'shutting';

const NEXT: Partial<Record<SceneState, SceneState>> = {
  lightsOn: 'screenOn',
  screenOn: 'zoomIn',
  zoomIn: 'working',
  zoomOut: 'screenOff',
  screenOff: 'lightsOff',
  lightsOff: 'dark',
};

const STEP_MS: Partial<Record<SceneState, number>> = {
  lightsOn: 1500,
  screenOn: 1800,
  zoomIn: 1300,
  zoomOut: 1300,
  screenOff: 500,
  lightsOff: 700,
};

export function reduceScene(state: SceneState, event: SceneEvent): SceneState {
  if (event.type === 'press') return state === 'dark' ? 'lightsOn' : state;
  if (event.type === 'shutdown') return state === 'working' ? 'zoomOut' : state;
  return NEXT[state] ?? state;
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

export function crtPhase(s: SceneState): CrtPhase {
  if (s === 'screenOn') return 'booting';
  if (s === 'zoomIn' || s === 'working' || s === 'zoomOut') return 'on';
  if (s === 'screenOff') return 'shutting';
  return 'off';
}
