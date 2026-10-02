import type { ArenaFrame, ArenaMap, RevealFrame } from '../../../bot/arena/frame.ts';
import { S3, toPx } from '../geometry.ts';
import { SLOT_COLOR, TERRAIN_COLOR, rgba, shade } from './palette.ts';

export interface View {
  size: number;
  cx: number;
  cy: number;
}

export function viewOf(width: number): View {
  return { size: width / (S3 * 40.5), cx: width / 2, cy: width / 2 };
}

function hex(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const X = x + s * Math.cos(a);
    const Y = y + s * Math.sin(a);
    if (i === 0) ctx.moveTo(X, Y);
    else ctx.lineTo(X, Y);
  }
  ctx.closePath();
}

function unitShape(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, cls: string): void {
  ctx.beginPath();
  if (cls === 'ткач') {
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.9, y + s * 0.7);
    ctx.lineTo(x - s * 0.9, y + s * 0.7);
  } else {
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.75, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s * 0.75, y);
  }
  ctx.closePath();
}

export function drawMap(ctx: CanvasRenderingContext2D, v: View, map: ArenaMap, frame: ArenaFrame | null, reveal: RevealFrame | null, selected: string | null): void {
  const { size, cx, cy } = v;
  const px = (q: number, r: number): [number, number] => toPx(q, r, size, cx, cy);
  ctx.clearRect(0, 0, cx * 2, cy * 2);
  for (const [q, r, t, lv] of map.cells) {
    const [x, y] = px(q, r);
    hex(ctx, x, y, size * 1.02);
    ctx.fillStyle = shade(TERRAIN_COLOR[t] ?? TERRAIN_COLOR['bare'] ?? '#3b4450', lv);
    ctx.fill();
  }
  const own = reveal ? reveal.own : frame?.own ?? {};
  const seen = new Set(Object.keys(own));
  if (!reveal && frame) {
    for (const [q, r] of map.cells) {
      if (seen.has(q + ',' + r)) continue;
      const [x, y] = px(q, r);
      hex(ctx, x, y, size * 1.02);
      ctx.fillStyle = 'rgba(8, 12, 16, 0.28)';
      ctx.fill();
    }
  }
  for (const [slot, c] of Object.entries(map.seats)) {
    const [x, y] = px(c.q, c.r);
    const s = size * 0.85;
    ctx.fillStyle = SLOT_COLOR[slot] ?? '#ffffff';
    ctx.fillRect(x - s, y - s, 2 * s, 2 * s);
    ctx.strokeStyle = '#0f151b';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - s, y - s, 2 * s, 2 * s);
  }
  for (const [k, o] of Object.entries(own)) {
    if (o === null) continue;
    const [q, r] = k.split(',').map(Number);
    const [x, y] = px(q ?? 0, r ?? 0);
    const col = SLOT_COLOR[o] ?? '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.48, 0, Math.PI * 2);
    if (!reveal && frame?.dark[k]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = col;
      ctx.fill();
    }
  }
  if (frame && !reveal) {
    for (const goal of frame.goals) {
      if (!goal.cell) continue;
      const [x, y] = px(goal.cell.q, goal.cell.r);
      const s = size * 0.95;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - s, y);
      ctx.lineTo(x + s, y);
      ctx.moveTo(x, y - s);
      ctx.lineTo(x, y + s);
      ctx.stroke();
    }
  }
  const foes = reveal ? reveal.units.filter((u) => u[1] !== map.slot) : frame?.foe ?? [];
  for (const [, p, cls, q, r] of foes) {
    const [x, y] = px(q, r);
    unitShape(ctx, x, y, size * 0.62, cls);
    ctx.fillStyle = rgba(SLOT_COLOR[p] ?? '#ffffff', 0.75);
    ctx.fill();
    ctx.strokeStyle = '#0f151b';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const mine = frame?.units ?? [];
  const mineCol = SLOT_COLOR[map.slot] ?? '#ffffff';
  for (const u of mine) {
    const [x, y] = px(u.q, u.r);
    unitShape(ctx, x, y, size * 0.7, u.cls);
    ctx.fillStyle = mineCol;
    ctx.fill();
    ctx.strokeStyle = '#0f151b';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (u.manual || u.goal !== null || u.id === selected) {
      ctx.beginPath();
      ctx.arc(x, y, size * 1.05, 0, Math.PI * 2);
      ctx.setLineDash(u.manual || u.id === selected ? [] : [3, 3]);
      ctx.strokeStyle = u.id === selected ? mineCol : '#ffffff';
      ctx.lineWidth = u.id === selected ? 2.5 : 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
