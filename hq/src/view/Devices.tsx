import type { ReactNode } from 'react';
import { DEVICES, FLAPS, place } from '../layout.ts';
import type { Box, Group } from '../layout.ts';

export type Reg = (name: string) => (el: Element | null) => void;

export interface BoardText {
  match: string;
  tick: string;
  focus: string;
  score: string;
}

export const GROUPS = ['match', 'tick', 'focus', 'score'] as const;
const tiles = new Map<string, HTMLCanvasElement>();

function tile(ch: string, w: number, h: number): HTMLCanvasElement {
  const key = ch + '|' + w + '|' + h;
  const hit = tiles.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, w);
  cv.height = Math.max(1, h);
  const ctx = cv.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#26251f');
    grad.addColorStop(0.49, '#1e1d19');
    grad.addColorStop(0.49, '#0b0b0a');
    grad.addColorStop(0.51, '#0b0b0a');
    grad.addColorStop(0.51, '#1c1b18');
    grad.addColorStop(1, '#141412');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    if (ch !== ' ') {
      ctx.fillStyle = '#f1ead6';
      ctx.font = '700 ' + Math.round(h * 0.7) + 'px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, w / 2, h / 2 + h * 0.03, w * 0.92);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(0, h * 0.49, w, Math.max(1, h * 0.02));
    }
  }
  tiles.set(key, cv);
  return cv;
}

export class BoardPainter {
  private last: Record<string, string> = {};
  private px = '';

  draw(cv: HTMLCanvasElement, width: number, height: number, text: BoardText): void {
    const ctx = cv.getContext('2d');
    if (!ctx || !width) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(width * dpr);
    const H = Math.round(height * dpr);
    if (this.px !== W + 'x' + H) {
      this.px = W + 'x' + H;
      cv.width = W;
      cv.height = H;
      this.last = {};
    }
    const b = DEVICES.board;
    for (const name of GROUPS) {
      const g = FLAPS[name];
      const str = text[name].padEnd(g.cells.length, ' ').slice(0, g.cells.length);
      const was = this.last[name] ?? '';
      if (was === str) continue;
      for (let i = 0; i < g.cells.length; i++) {
        const ch = str[i] ?? ' ';
        if (was[i] === ch) continue;
        const c = g.cells[i];
        if (!c) continue;
        const x = ((g.box.x + (g.box.w * c.x) / 100 - b.x) / b.w) * W;
        const y = ((g.box.y + (g.box.h * c.y) / 100 - b.y) / b.h) * H;
        const w = ((g.box.w * c.w) / 100 / b.w) * W;
        const h = ((g.box.h * c.h) / 100 / b.h) * H;
        ctx.drawImage(tile(ch, Math.round(w), Math.round(h)), Math.round(x), Math.round(y));
      }
      this.last[name] = str;
    }
  }
}

export function Board({ canvas, reg }: { canvas: (el: HTMLCanvasElement | null) => void; reg: Reg }) {
  return (
    <>
      <canvas ref={canvas} className="board" style={place(DEVICES.board)} />
      {GROUPS.map((name) => (
        <span key={name} className="flapKey" data-zaria={name} ref={reg(name)} style={place(FLAPS[name].box)} />
      ))}
    </>
  );
}

export function Tubes({ name, g, reg }: { name: string; g: Group; reg: Reg }) {
  return (
    <span className="tubes" data-zaria={name} ref={reg(name)} style={place(g.box)}>
      {g.cells.map((c, i) => (
        <span key={i} className="tube" style={place(c)} />
      ))}
    </span>
  );
}

export function Spot({ b, className, children, at }: { b: Box; className?: string; children?: ReactNode; at?: (el: Element | null) => void }) {
  return (
    <div ref={at} className={'spot' + (className ? ' ' + className : '')} style={place(b)}>
      {children}
    </div>
  );
}
