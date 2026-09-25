import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import { curl, matrixCss, polygonCss, type Curl, type PageFrame, type Point, type Side } from '../notebook/curl.ts';
import type { TurnFrame } from '../notebook/turn.ts';
import { A } from '../anchors.ts';

type LayersProps = {
  frame: TurnFrame;
  size: PageFrame;
  turning: ReactNode;
  under: ReactNode;
  back: ReactNode;
};

const SHADOW = 0.14;

function Shadow({ g, size }: { g: Curl; size: PageFrame }) {
  const thickness = SHADOW * size.w;
  const style: CSSProperties = {
    left: g.shadow.x - g.shadow.length / 2,
    top: g.shadow.y - thickness / 2,
    width: g.shadow.length,
    height: thickness,
    transform: `rotate(${g.shadow.angleDeg}deg)`,
  };
  return <div className="curl-shadow" style={style} />;
}

export function CurlLayers({ frame, size, turning, under, back }: LayersProps) {
  if (frame.side === null) return null;
  const g = curl(frame.side, size, frame.pointer);
  if (!g) return null;
  const turningX = frame.side === 'next' ? size.w : 0;
  const underX = turningX;
  const backX = frame.side === 'next' ? 0 : size.w;
  return (
    <div className="curl" aria-hidden="true">
      <div className="curl-layer" style={{ clipPath: polygonCss(g.page) }}>
        <div className="curl-page" style={{ left: turningX }}>{turning}</div>
      </div>
      <div className="curl-layer" style={{ clipPath: polygonCss(g.leaf) }}>
        <div className="curl-page" style={{ left: underX }}>{under}</div>
        <Shadow g={g} size={size} />
      </div>
      <div className="curl-layer" style={{ clipPath: polygonCss(g.back) }}>
        <div className="curl-page curl-back" style={{ left: backX, transform: matrixCss(g.backMatrix) }}>{back}</div>
        <Shadow g={g} size={size} />
      </div>
    </div>
  );
}

type CornerProps = {
  side: Side;
  enabled: boolean;
  dragging: boolean;
  measure: () => { size: PageFrame; toBook: (e: PointerEvent) => Point } | null;
  onPeek: (side: Side, size: PageFrame) => void;
  onUnpeek: () => void;
  onGrab: (side: Side, size: PageFrame, p: Point) => void;
  onMove: (p: Point) => void;
  onDrop: () => void;
};

export function Corner({ side, enabled, dragging, measure, onPeek, onUnpeek, onGrab, onMove, onDrop }: CornerProps) {
  if (!enabled) return null;
  const withBook = (e: PointerEvent, act: (size: PageFrame, p: Point) => void): void => {
    const m = measure();
    if (m) act(m.size, m.toBook(e));
  };
  return (
    <div
      className={`curl-corner ${side}`}
      data-zaria={A.notebookCorner}
      onPointerEnter={(e) => withBook(e, (size) => onPeek(side, size))}
      onPointerLeave={() => { if (!dragging) onUnpeek(); }}
      onPointerDown={(e) => {
        e.preventDefault();
        if (e.isTrusted) e.currentTarget.setPointerCapture(e.pointerId);
        withBook(e, (size, p) => onGrab(side, size, p));
      }}
      onPointerMove={(e) => { if (dragging) withBook(e, (_size, p) => onMove(p)); }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        onDrop();
      }}
      onPointerCancel={() => onDrop()}
    />
  );
}
