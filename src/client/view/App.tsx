import { useCallback, useEffect, useReducer } from 'react';
import { reduceScene, stepDuration } from '../scene/machine.ts';
import { useAgent } from '../agent/useAgent.ts';
import { Stage } from './Stage.tsx';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function App() {
  const [scene, dispatch] = useReducer(reduceScene, 'dark');
  const snapshot = useAgent();

  useEffect(() => {
    const ms = stepDuration(scene, reducedMotion);
    if (ms === null) return;
    const t = setTimeout(() => dispatch({ type: 'stepDone' }), ms);
    return () => clearTimeout(t);
  }, [scene]);

  const onPress = useCallback(() => dispatch({ type: 'press' }), []);
  const onShutdown = useCallback(() => dispatch({ type: 'shutdown' }), []);

  return <Stage scene={scene} snapshot={snapshot} reducedMotion={reducedMotion} onPress={onPress} onShutdown={onShutdown} />;
}
