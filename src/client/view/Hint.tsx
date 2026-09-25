import { useEffect, useState } from 'react';
import { hintFor } from '../scene/hints.ts';
import type { SceneState } from '../scene/machine.ts';
import { A } from '../anchors.ts';

const SHOW_MS = 4000;

export function Hint({ scene }: { scene: SceneState }) {
  const text = hintFor(scene);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (text === null) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const t = setTimeout(() => setVisible(false), SHOW_MS);
    return () => clearTimeout(t);
  }, [text]);

  return (
    <div className={`hint${visible ? ' shown' : ''}`} data-zaria={A.hint} aria-live="polite">
      {text ?? ''}
    </div>
  );
}
