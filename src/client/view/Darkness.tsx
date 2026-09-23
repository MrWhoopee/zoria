import { useEffect, useState } from 'react';
import type { SceneState } from '../scene/machine.ts';
import { DARKNESS_OFF, POWER_ON_DARKNESS, type FlickerEvent } from '../scene/flicker.ts';

type Props = { scene: SceneState; reducedMotion: boolean; onFlicker?: (e: FlickerEvent) => void };

export function Darkness({ scene, reducedMotion, onFlicker }: Props) {
  const [opacity, setOpacity] = useState(DARKNESS_OFF);
  const [instant, setInstant] = useState(false);

  useEffect(() => {
    if (scene === 'dark' || scene === 'lightsOff') {
      setInstant(false);
      setOpacity(DARKNESS_OFF);
      return;
    }
    if (scene !== 'lightsOn' || reducedMotion) {
      setInstant(false);
      setOpacity(0);
      return;
    }
    setInstant(true);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let at = 0;
    for (const [value, ms] of POWER_ON_DARKNESS) {
      timers.push(setTimeout(() => {
        setOpacity(value);
        if (value > 0.3 && onFlicker) onFlicker({ lamp: 'room', depth: value, durationMs: ms });
      }, at));
      at += ms;
    }
    return () => timers.forEach(clearTimeout);
  }, [scene, reducedMotion, onFlicker]);

  return <div className="darkness" style={{ opacity, transition: instant ? 'none' : 'opacity .6s' }} />;
}
