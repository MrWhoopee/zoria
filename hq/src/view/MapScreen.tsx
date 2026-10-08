import type { Mode } from '../model/derive.ts';
import type { TruthAt } from '../model/truth.ts';

const COLOR: Record<string, string> = { A: '#ffb347', B: '#4fe3d4', C: '#f27be8', K: '#e9f5e0' };
const LAND: Record<string, string> = {
  water: 'rgba(30, 90, 110, 0.55)',
  mount: 'rgba(170, 220, 170, 0.32)',
  hill: 'rgba(120, 190, 120, 0.2)',
  wood: 'rgba(60, 140, 70, 0.32)',
  marsh: 'rgba(70, 120, 90, 0.3)',
  sand: 'rgba(170, 190, 110, 0.18)',
  meadow: 'rgba(90, 170, 90, 0.12)',
};
const S3 = Math.sqrt(3);
const coords = new Map<string, [number, number]>();
const RADIUS = 20;

export interface MapState {
  needles: string[];
  land: [string, string][] | null;
  truth: TruthAt | null;
  belief: Map<string, string | null> | null;
  mode: Mode;
  cell: string;
  ghost: string;
  zoom: number;
}

function parse(key: string): [number, number] {
  const [q, r] = key.split(',').map(Number);
  return [q ?? 0, r ?? 0];
}

function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + (S3 / 2) * s, y - s / 2);
  ctx.lineTo(x + (S3 / 2) * s, y + s / 2);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x - (S3 / 2) * s, y + s / 2);
  ctx.lineTo(x - (S3 / 2) * s, y - s / 2);
  ctx.closePath();
}

function paintLand(land: [string, string][] | null, px: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = px;
  cv.height = px;
  const ctx = cv.getContext('2d');
  if (!ctx) return cv;
  const c = px / 2;
  const size = px / (S3 * (2 * RADIUS + 1));
  const xy = (q: number, r: number): [number, number] => [c + size * S3 * (q + r / 2), c + size * 1.5 * r];
  const types = new Map(land ?? []);
  ctx.lineWidth = Math.max(0.5, size / 14);
  ctx.strokeStyle = 'rgba(140, 255, 160, 0.09)';
  for (let q = -RADIUS; q <= RADIUS; q++) {
    for (let r = Math.max(-RADIUS, -q - RADIUS); r <= Math.min(RADIUS, -q + RADIUS); r++) {
      const [x, y] = xy(q, r);
      ctx.beginPath();
      hexPath(ctx, x, y, size * 0.98);
      const fill = LAND[types.get(q + ',' + r) ?? ''];
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (size > 4) ctx.stroke();
    }
  }
  return cv;
}

export class MapPainter {
  private base: { key: unknown; px: number; cv: HTMLCanvasElement } | null = null;

  draw(cv: HTMLCanvasElement, width: number, { needles, land, truth, belief, mode, cell, ghost, zoom }: MapState): void {
    const ctx = cv.getContext('2d');
    if (!ctx || !width) return;
    const px = Math.round(width * (window.devicePixelRatio || 1) * zoom);
    if (cv.width !== px) {
      cv.width = px;
      cv.height = px;
    }
    if (!this.base || this.base.key !== land || this.base.px !== px) this.base = { key: land, px, cv: paintLand(land, px) };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    ctx.drawImage(this.base.cv, 0, 0);
    const c = px / 2;
    const size = px / (S3 * (2 * RADIUS + 1));
    const xy = (q: number, r: number): [number, number] => [c + size * S3 * (q + r / 2), c + size * 1.5 * r];
    const at = (k: string): [number, number] => {
      let qr = coords.get(k);
      if (!qr) {
        qr = parse(k);
        coords.set(k, qr);
      }
      return xy(qr[0], qr[1]);
    };
    const fine = zoom > 1.5;
    const line = (w: number): number => Math.max(1, size * w);

    if (truth && mode !== 'belief') {
      ctx.lineCap = 'round';
      for (const [slot, flat] of Object.entries(truth.links)) {
        ctx.strokeStyle = COLOR[slot] ?? '#9fe0a2';
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = line(0.18);
        ctx.beginPath();
        for (let i = 0; i + 3 < flat.length; i += 4) {
          const [ax, ay] = xy(flat[i] ?? 0, flat[i + 1] ?? 0);
          const [bx, by] = xy(flat[i + 2] ?? 0, flat[i + 3] ?? 0);
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const k of truth.order) {
        const [x, y] = at(k);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = line(0.12);
        ctx.setLineDash([size * 0.4, size * 0.3]);
        ctx.beginPath();
        hexPath(ctx, x, y, size * 1.15);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      for (const [slot, q, r, rad] of truth.scans) {
        const [x, y] = xy(q, r);
        ctx.strokeStyle = COLOR[slot] ?? '#9fe0a2';
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = line(0.08);
        ctx.setLineDash([size * 0.25, size * 0.35]);
        ctx.beginPath();
        ctx.arc(x, y, size * S3 * (rad + 0.5), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    }

    const rad = Math.max(1.5, size * 0.6);
    const dot = (k: string, owner: string | null | undefined, r: number, ring: boolean): void => {
      const [x, y] = at(k);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      const col = owner ? COLOR[owner] ?? '#9fe0a2' : 'rgba(170, 230, 170, 0.35)';
      if (ring) {
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1, r / 3);
        ctx.stroke();
      } else {
        ctx.fillStyle = col;
        ctx.fill();
      }
    };
    for (const k of needles) {
      if (mode !== 'belief') dot(k, truth?.owners[k], rad, false);
      if (mode !== 'truth' && belief?.has(k)) dot(k, belief.get(k), mode === 'both' ? rad * 1.7 : rad, mode === 'both');
    }

    if (truth && mode !== 'belief') {
      ctx.strokeStyle = '#ff5a4a';
      ctx.lineWidth = line(0.14);
      for (const k of truth.jam) {
        const [x, y] = at(k);
        const d = rad * 1.4;
        ctx.beginPath();
        ctx.moveTo(x - d, y - d);
        ctx.lineTo(x + d, y + d);
        ctx.moveTo(x + d, y - d);
        ctx.lineTo(x - d, y + d);
        ctx.stroke();
      }
      for (const [, slot, cls, q, r] of truth.units) {
        const [x, y] = xy(q, r);
        const col = COLOR[slot] ?? '#9fe0a2';
        const u = size * (fine ? 0.95 : 0.9);
        ctx.fillStyle = col;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.lineWidth = Math.max(0.5, size * 0.06);
        ctx.beginPath();
        if (slot === 'K') {
          ctx.rect(x - u * 0.6, y - u * 0.6, u * 1.2, u * 1.2);
        } else if (cls === 'ткач') {
          ctx.moveTo(x, y - u);
          ctx.lineTo(x + u * 0.9, y + u * 0.7);
          ctx.lineTo(x - u * 0.9, y + u * 0.7);
          ctx.closePath();
        } else {
          ctx.moveTo(x, y - u);
          ctx.lineTo(x + u * 0.7, y);
          ctx.lineTo(x, y + u);
          ctx.lineTo(x - u * 0.7, y);
          ctx.closePath();
        }
        ctx.fill();
        ctx.stroke();
      }
    }

    if (ghost && ghost !== '-') {
      const [x, y] = at(ghost);
      ctx.strokeStyle = '#ff6a5c';
      ctx.lineWidth = line(0.1);
      ctx.beginPath();
      ctx.moveTo(x - rad * 2.2, y);
      ctx.lineTo(x + rad * 2.2, y);
      ctx.moveTo(x, y - rad * 2.2);
      ctx.lineTo(x, y + rad * 2.2);
      ctx.stroke();
    }
    if (cell) {
      const [x, y] = at(cell);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = line(0.12);
      ctx.beginPath();
      hexPath(ctx, x, y, size * 1.25);
      ctx.stroke();
    }
  }
}

export function MapScreen({ zoom, onPick, canvas }: { zoom: number; onPick: (cell: string) => void; canvas: (el: HTMLCanvasElement | null) => void }) {
  const pick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (zoom <= 1) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const w = rect.width;
    const size = w / (S3 * (2 * RADIUS + 1));
    const x = e.clientX - rect.left - w / 2;
    const y = e.clientY - rect.top - w / 2;
    const r = y / (1.5 * size);
    const q = x / (S3 * size) - r / 2;
    let rq = Math.round(q);
    let rr = Math.round(r);
    const rs = Math.round(-q - r);
    const dq = Math.abs(rq - q);
    const dr = Math.abs(rr - r);
    const ds = Math.abs(rs + q + r);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    if (Math.max(Math.abs(rq), Math.abs(rr), Math.abs(rq + rr)) <= RADIUS) onPick(rq + ',' + rr);
  };

  return <canvas ref={canvas} className="map" onClick={pick} />;
}
