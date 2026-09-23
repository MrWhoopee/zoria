import { GLASS, JAM_LED, LAMPS, METERS, POWER_BUTTON, SCREEN, ZOOM, type Glow, type Rect } from '../scene/geometry.ts';
import { KEYBOARD } from '../scene/keyboard-map.ts';

const enabled = new URLSearchParams(location.search).has('debug');

const rect = (r: Rect, color: string) => (
  <rect x={r.left} y={r.top} width={r.width} height={r.height} fill="none" stroke={color} strokeWidth={0.0012} />
);
const ellipse = (g: Glow, color: string) => (
  <ellipse cx={g.x} cy={g.y} rx={g.w / 2} ry={g.h / 2} fill="none" stroke={color} strokeWidth={0.0012} />
);

export function GeometryDebug() {
  if (!enabled) return null;
  return (
    <svg className="geometry-debug" viewBox="0 0 1 1" preserveAspectRatio="none">
      {rect(GLASS.rect, '#00e5ff')}
      {rect(SCREEN, '#2979ff')}
      {[...KEYBOARD.entries()].map(([code, q]) => (
        <polygon key={code} points={q.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#76ff03" strokeWidth={0.0008} />
      ))}
      {LAMPS.map((l) => <g key={l.id}>{ellipse(l.bulb, '#ffd740')}{ellipse(l.pool, '#ffab40')}</g>)}
      {METERS.map((m, i) => <g key={i}>{ellipse(m, '#ff9100')}</g>)}
      {ellipse(JAM_LED, '#ff1744')}
      <circle cx={POWER_BUTTON.center.x} cy={POWER_BUTTON.center.y} r={POWER_BUTTON.radius} fill="none" stroke="#ff1744" strokeWidth={0.0012} />
      <path d={`M${ZOOM.origin.x - 0.01} ${ZOOM.origin.y}H${ZOOM.origin.x + 0.01}M${ZOOM.origin.x} ${ZOOM.origin.y - 0.017}V${ZOOM.origin.y + 0.017}`} stroke="#fff" strokeWidth={0.0012} />
    </svg>
  );
}
