import type { CSSProperties } from 'react';
import { acceptsInput, isLit, isZoomed, type SceneState } from '../scene/machine.ts';
import { ZOOM } from '../scene/geometry.ts';
import type { FlickerEvent } from '../scene/flicker.ts';
import type { Snapshot } from '../agent/snapshot.ts';
import { A } from '../anchors.ts';
import { Photo } from './Photo.tsx';
import { Darkness } from './Darkness.tsx';
import { PowerButton } from './PowerButton.tsx';
import { Terminal } from './Terminal.tsx';
import { Lights } from './Lights.tsx';
import { Keyboard } from './Keyboard.tsx';
import { GeometryDebug } from './GeometryDebug.tsx';

export type StageProps = {
  scene: SceneState;
  snapshot: Snapshot | null;
  reducedMotion: boolean;
  onPress: () => void;
  onShutdown: () => void;
  onStepBack: () => void;
  onFlicker?: (e: FlickerEvent) => void;
  onKey?: (code: string) => void;
};

export function Stage({ scene, snapshot, reducedMotion, onPress, onShutdown, onStepBack, onFlicker, onKey }: StageProps) {
  const classes = ['stage', isLit(scene) && 'lit', isZoomed(scene) && 'zoomed'].filter(Boolean).join(' ');
  const world = {
    transformOrigin: `${ZOOM.origin.x * 100}% ${ZOOM.origin.y * 100}%`,
    '--zoom': ZOOM.scale,
  } as CSSProperties;
  const jammed = snapshot !== null && snapshot.ether.silentUntil > Date.now();
  return (
    <div className={classes} data-zaria={A.scene} data-scene={scene}>
      <div className="world" style={world}>
        <Terminal scene={scene} snapshot={snapshot} onShutdown={onShutdown} onStepBack={onStepBack} />
        <Photo />
        <Lights lit={isLit(scene)} jammed={jammed} reducedMotion={reducedMotion} onFlicker={onFlicker} />
        <Keyboard active={acceptsInput(scene)} onKey={onKey} />
        <Darkness scene={scene} reducedMotion={reducedMotion} onFlicker={onFlicker} />
        <PowerButton scene={scene} onPress={onPress} />
        <GeometryDebug />
      </div>
    </div>
  );
}
