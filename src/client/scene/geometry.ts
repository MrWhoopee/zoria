export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; width: number; height: number };
export type Glow = { x: number; y: number; w: number; h: number };

const PW = 1024;
const PH = 572;

export function fromPhoto(x: number, y: number): Point {
  return { x: x / PW, y: y / PH };
}

const box = (x0: number, y0: number, x1: number, y1: number): Rect =>
  ({ left: x0 / PW, top: y0 / PH, width: (x1 - x0) / PW, height: (y1 - y0) / PH });

const glow = (x: number, y: number, w: number, h: number): Glow =>
  ({ x: x / PW, y: y / PH, w: w / PW, h: h / PH });

export const GLASS = { rect: box(416, 152, 608, 306), exponent: 5 };
export const SCREEN = box(410, 146, 614, 312);
export const ZOOM = { origin: fromPhoto(512, 270), scale: 1.75 };
export const NOTEBOOK = box(800, 503, 972, 572);
export const POWER_BUTTON = { center: fromPhoto(512, 490), radius: 24 / PW };
export const JAM_LED = glow(685, 185, 24, 24);

export const LAMPS: ReadonlyArray<{ id: string; bulb: Glow; pool: Glow }> = [
  { id: 'left', bulb: glow(152, 207, 92, 92), pool: glow(156, 255, 195, 120) },
  { id: 'right', bulb: glow(940, 223, 92, 92), pool: glow(903, 257, 195, 120) },
];

export const METERS: Glow[] = [
  glow(745, 152, 31, 14), glow(777, 152, 31, 14),
  glow(883, 298, 27, 14), glow(908, 298, 27, 14),
  glow(747, 327, 27, 14), glow(773, 327, 27, 14),
  glow(138, 298, 57, 14), glow(245, 331, 41, 14),
];

const OUTLINE_POINTS = 256;

export function glassOutline(): Point[] {
  const a = (GLASS.rect.width * PW) / 2;
  const b = (GLASS.rect.height * PH) / 2;
  const cx = GLASS.rect.left * PW + a;
  const cy = GLASS.rect.top * PH + b;
  const n = GLASS.exponent;
  const points: Point[] = [];
  for (let k = 0; k < OUTLINE_POINTS; k += 1) {
    const t = (2 * Math.PI * k) / OUTLINE_POINTS;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const r = (Math.abs(c / a) ** n + Math.abs(s / b) ** n) ** (-1 / n);
    points.push({ x: cx + r * c, y: cy + r * s });
  }
  return points;
}

export function glassMaskDataUri(): string {
  const f = (v: number): string => String(Math.round(v * 100) / 100);
  const hole = glassOutline().map((p, k) => `${k === 0 ? 'M' : 'L'}${f(p.x)} ${f(p.y)}`).join('') + 'Z';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${PW} ${PH}' preserveAspectRatio='none'>`
    + `<path fill='white' fill-rule='evenodd' d='M0 0H${PW}V${PH}H0Z ${hole}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
