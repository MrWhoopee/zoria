import { useEffect, useRef, useState } from 'react';
import photoUrl from '../assets/room.webp';
import { KEYBOARD } from '../scene/keyboard-map.ts';
import { keyPatch } from '../scene/keys.ts';

const PATCHES = [...KEYBOARD.entries()].map(([code, quad]) => ({ code, patch: keyPatch(quad) }));
const pct = (n: number): string => `${n * 100}%`;

export function Keyboard({ active, onKey }: { active: boolean; onKey?: (code: string) => void }) {
  const [down, setDown] = useState<ReadonlySet<string>>(() => new Set());
  const keyRef = useRef(onKey);

  useEffect(() => {
    keyRef.current = onKey;
  }, [onKey]);

  useEffect(() => {
    if (!active) {
      setDown(new Set());
      return;
    }
    const press = (e: KeyboardEvent): void => {
      if (!KEYBOARD.has(e.code) || e.repeat) return;
      keyRef.current?.(e.code);
      setDown((s) => new Set(s).add(e.code));
    };
    const release = (e: KeyboardEvent): void => {
      setDown((s) => {
        if (!s.has(e.code)) return s;
        const next = new Set(s);
        next.delete(e.code);
        return next;
      });
    };
    const clear = (): void => setDown(new Set());
    addEventListener('keydown', press);
    addEventListener('keyup', release);
    addEventListener('blur', clear);
    return () => {
      removeEventListener('keydown', press);
      removeEventListener('keyup', release);
      removeEventListener('blur', clear);
    };
  }, [active]);

  return (
    <div className="keyboard">
      {PATCHES.map(({ code, patch }) => (
        <div
          key={code}
          className={`key${down.has(code) ? ' down' : ''}`}
          style={{
            left: pct(patch.left), top: pct(patch.top), width: pct(patch.width), height: pct(patch.height),
            clipPath: patch.clip, backgroundImage: `url(${photoUrl})`,
            backgroundSize: patch.bgSize, backgroundPosition: patch.bgPos,
          }}
        />
      ))}
    </div>
  );
}
