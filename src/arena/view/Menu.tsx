import { useEffect } from 'react';
import type { MenuItem } from '../menu.ts';

export function Menu({ x, y, title, items, onPick, onClose }: { x: number; y: number; title: string; items: MenuItem[]; onPick: (m: MenuItem) => void; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="menu-scrim" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div className="menu" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
        <div className="menu-title">{title}</div>
        {items.length === 0 ? <div className="menu-empty">Тут нічого не наказати</div> : null}
        {items.map((m) => (
          <button key={m.label} onClick={() => onPick(m)}>
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
