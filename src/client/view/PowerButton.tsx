import type { SceneState } from '../scene/machine.ts';
import { POWER_BUTTON } from '../scene/geometry.ts';
import { A } from '../anchors.ts';

export function PowerButton({ scene, onPress }: { scene: SceneState; onPress: () => void }) {
  const size = POWER_BUTTON.radius * 2 * 100;
  return (
    <button
      type="button"
      className={`power-button${scene === 'dark' ? ' armed' : ''}`}
      data-zaria={A.powerButton}
      aria-label="Power on the terminal"
      disabled={scene !== 'dark'}
      onClick={onPress}
      style={{ left: `${POWER_BUTTON.center.x * 100}%`, top: `${POWER_BUTTON.center.y * 100}%`, width: `${size}%` }}
    />
  );
}
