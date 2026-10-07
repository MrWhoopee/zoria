import { useEffect, useRef } from 'react';
import type { Mode } from '../model/derive.ts';

const COLOR: Record<string, string> = { A: '#f2b134', B: '#3fb8af', C: '#d06bd6', K: '#e8e8e8' };
const S3 = Math.sqrt(3);

export interface MapProps {
  needles: string[];
  truth: Record<string, string | null> | null;
  belief: Map<string, string | null> | null;
  mode: Mode;
  cell: string;
  ghost: string;
  big: boolean;
  onPick: (cell: string) => void;
}

function xy(key: string, size: number, c: number): [number, number] {
  const [q, r] = key.split(',').map(Number);
  return [c + size * S3 * ((q ?? 0) + (r ?? 0) / 2), c + size * 1.5 * (r ?? 0)];
}

export function MapScreen({ needles, truth, belief, mode, cell, ghost, big, onPick }: MapProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const w = cv.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(w * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, w);
    const c = w / 2;
    const size = w / (S3 * 40);
    ctx.strokeStyle = 'rgba(120, 255, 140, 0.18)';
    ctx.lineWidth = 1;
    for (const r of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.arc(c, c, c * r * 1.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    const dot = (k: string, owner: string | null | undefined, rad: number, ring: boolean): void => {
      const [x, y] = xy(k, size, c);
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      const col = owner ? COLOR[owner] ?? '#9fe0a2' : 'rgba(160, 200, 160, 0.35)';
      if (ring) {
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1, rad / 2.5);
        ctx.stroke();
      } else {
        ctx.fillStyle = col;
        ctx.fill();
      }
    };
    const rad = Math.max(1.5, size * 0.75);
    for (const k of needles) {
      if (mode !== 'belief') dot(k, truth?.[k], rad, false);
      if (mode !== 'truth' && belief?.has(k)) dot(k, belief.get(k), mode === 'both' ? rad * 1.7 : rad, mode === 'both');
    }
    if (ghost && ghost !== '-') {
      const [x, y] = xy(ghost, size, c);
      ctx.strokeStyle = '#ff6a5c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - rad * 2, y);
      ctx.lineTo(x + rad * 2, y);
      ctx.moveTo(x, y - rad * 2);
      ctx.lineTo(x, y + rad * 2);
      ctx.stroke();
    }
    if (cell) {
      const [x, y] = xy(cell, size, c);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, rad * 2.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [needles, truth, belief, mode, cell, ghost, big]);

  const pick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!big) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const w = rect.width;
    const size = w / (S3 * 40);
    const x = e.clientX - rect.left - w / 2;
    const y = e.clientY - rect.top - w / 2;
    const r = y / (1.5 * size);
    const q = x / (S3 * size) - r / 2;
    let best = '';
    let bd = Infinity;
    for (const k of needles) {
      const [nq, nr] = k.split(',').map(Number);
      const d = Math.hypot((nq ?? 0) - q, (nr ?? 0) - r);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    if (best && bd < 2.5) onPick(best);
  };

  return <canvas ref={ref} className="map" onClick={pick} />;
}
