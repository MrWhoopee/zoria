import type { Rect } from '../scene/geometry.ts';

const pct = (n: number): string => `${n * 100}%`;

type Props = { rect: Rect; label: string; anchor: string; onClick: () => void };

export function Hotspot({ rect, label, anchor, onClick }: Props) {
  return (
    <button
      type="button"
      className="hotspot"
      data-zaria={anchor}
      aria-label={label}
      onClick={onClick}
      style={{ left: pct(rect.left), top: pct(rect.top), width: pct(rect.width), height: pct(rect.height) }}
    />
  );
}
