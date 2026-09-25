import type { SceneState } from '../scene/machine.ts';
import { POWER_BUTTON } from '../scene/geometry.ts';
import { A } from '../anchors.ts';

export function PowerButton({ scene, onPress }: { scene: SceneState; onPress: () => void }) {
  const size = POWER_BUTTON.radius * 2 * 100;
  const enabled = scene === 'dark' || scene === 'room';
  const classes = ['power-button', scene === 'dark' && 'armed', scene === 'room' && 'hotspot-round'].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={classes}
      data-zaria={A.powerButton}
      aria-label={scene === 'room' ? 'Power off the terminal' : 'Power on the terminal'}
      disabled={!enabled}
      onClick={onPress}
      style={{ left: `${POWER_BUTTON.center.x * 100}%`, top: `${POWER_BUTTON.center.y * 100}%`, width: `${size}%` }}
    />
  );
}
