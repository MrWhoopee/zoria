import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { crtPhase, isLit, reduceScene, stepDuration } from '../scene/machine.ts';
import { useAgent } from '../agent/useAgent.ts';
import { createAudioEngine } from '../audio/engine.ts';
import { SAMPLE_URLS } from '../audio/samples.ts';
import type { FlickerEvent } from '../scene/flicker.ts';
import { Stage } from './Stage.tsx';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function App() {
  const [scene, dispatch] = useReducer(reduceScene, 'dark');
  const snapshot = useAgent();
  const audio = useMemo(() => createAudioEngine(SAMPLE_URLS), []);

  useEffect(() => {
    audio.load();
    return () => audio.close();
  }, [audio]);

  useEffect(() => {
    const ms = stepDuration(scene, reducedMotion);
    if (ms === null) return;
    const t = setTimeout(() => dispatch({ type: 'stepDone' }), ms);
    return () => clearTimeout(t);
  }, [scene]);

  useEffect(() => {
    audio.setLit(isLit(scene));
    const crt = crtPhase(scene);
    if (crt === 'booting') audio.play('crtOn');
    if (crt === 'shutting') audio.play('crtOff');
  }, [scene, audio]);

  const onPress = useCallback(() => {
    audio.unlock();
    audio.play('relay');
    dispatch({ type: scene === 'room' ? 'shutdown' : 'press' });
  }, [audio, scene]);
  const onShutdown = useCallback(() => dispatch({ type: 'shutdown' }), []);
  const onStepBack = useCallback(() => dispatch({ type: 'stepBack' }), []);
  const onApproach = useCallback(() => dispatch({ type: 'approach' }), []);
  const onOpenNotebook = useCallback(() => dispatch({ type: 'openNotebook' }), []);
  const onCloseNotebook = useCallback(() => dispatch({ type: 'closeNotebook' }), []);
  const onTurnPage = useCallback(() => undefined, []);

  useEffect(() => {
    if (scene !== 'room') return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') { e.preventDefault(); dispatch({ type: 'approach' }); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [scene]);
  const onFlicker = useCallback((e: FlickerEvent) => audio.flicker(e), [audio]);
  const onKey = useCallback((code: string) => audio.key(code), [audio]);

  return (
    <Stage
      scene={scene}
      snapshot={snapshot}
      reducedMotion={reducedMotion}
      onPress={onPress}
      onShutdown={onShutdown}
      onStepBack={onStepBack}
      onApproach={onApproach}
      onOpenNotebook={onOpenNotebook}
      onCloseNotebook={onCloseNotebook}
      onTurnPage={onTurnPage}
      onFlicker={onFlicker}
      onKey={onKey}
    />
  );
}
