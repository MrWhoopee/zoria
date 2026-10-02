import { useEffect, useRef, useState } from 'react';
import type { ArenaFrame, ArenaMap, RevealFrame } from '../../../bot/arena/frame.ts';
import { toHex } from '../geometry.ts';
import { drawMap, viewOf } from './draw.ts';

export interface MapPick {
  q: number;
  r: number;
  x: number;
  y: number;
}

export function MapCanvas({ map, frame, reveal, selected, onSelect, onMenu }: { map: ArenaMap; frame: ArenaFrame | null; reveal: RevealFrame | null; selected: string | null; onSelect: (cell: MapPick) => void; onMenu: (cell: MapPick) => void }) {
  const box = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(720);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(320, Math.min(el.clientWidth, el.clientHeight))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(width * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMap(ctx, viewOf(width), map, frame, reveal, selected);
  }, [width, map, frame, reveal, selected]);

  const pick = (e: React.MouseEvent<HTMLCanvasElement>): MapPick => {
    const rect = e.currentTarget.getBoundingClientRect();
    const v = viewOf(width);
    const cell = toHex(e.clientX - rect.left, e.clientY - rect.top, v.size, v.cx, v.cy);
    return { ...cell, x: e.clientX, y: e.clientY };
  };

  return (
    <div className="map" ref={box}>
      <canvas
        ref={canvas}
        style={{ width, height: width }}
        onClick={(e) => onSelect(pick(e))}
        onContextMenu={(e) => {
          e.preventDefault();
          onMenu(pick(e));
        }}
      />
    </div>
  );
}
