import { useEffect, useRef, useState } from 'react';
import { JAM_LED, LAMPS, METERS, type Glow } from '../scene/geometry.ts';
import { DEFAULT_FLICKER, meterLevels, planFlickers, type FlickerEvent } from '../scene/flicker.ts';
import { A } from '../anchors.ts';

type Props = { lit: boolean; jammed: boolean; reducedMotion: boolean; onFlicker?: (e: FlickerEvent) => void };

const LAMP_IDS = LAMPS.map((l) => l.id);
const place = (g: Glow) => ({ left: `${g.x * 100}%`, top: `${g.y * 100}%`, width: `${g.w * 100}%`, height: `${g.h * 100}%` });

function without(dips: Record<string, number>, lamp: string): Record<string, number> {
  const next = { ...dips };
  delete next[lamp];
  return next;
}

export function Lights({ lit, jammed, reducedMotion, onFlicker }: Props) {
  const [dips, setDips] = useState<Record<string, number>>({});
  const [levels, setLevels] = useState<number[]>(() => METERS.map(() => 0));
  const flickerRef = useRef(onFlicker);

  useEffect(() => {
    flickerRef.current = onFlicker;
  }, [onFlicker]);

  useEffect(() => {
    if (!lit || reducedMotion) {
      setDips({});
      setLevels(METERS.map(() => (lit ? 0.8 : 0)));
      return;
    }
    const recover = new Map<string, ReturnType<typeof setTimeout>>();
    const tick = setInterval(() => {
      setLevels(meterLevels(METERS.length, Math.random));
      for (const ev of planFlickers(LAMP_IDS, Math.random, DEFAULT_FLICKER)) {
        flickerRef.current?.(ev);
        setDips((d) => ({ ...d, [ev.lamp]: ev.depth }));
        clearTimeout(recover.get(ev.lamp));
        recover.set(ev.lamp, setTimeout(() => {
          recover.delete(ev.lamp);
          setDips((d) => without(d, ev.lamp));
        }, ev.durationMs));
      }
    }, 110);
    return () => {
      clearInterval(tick);
      recover.forEach(clearTimeout);
    };
  }, [lit, reducedMotion]);

  return (
    <div className={`lights${lit ? ' lit' : ''}`}>
      {LAMPS.map((lamp) => {
        const dip = dips[lamp.id];
        const filter = dip === undefined ? undefined : `brightness(${1 - dip})`;
        return (
          <div key={lamp.id} className="lamp">
            <div className="pool" style={{ ...place(lamp.pool), filter }} />
            <div className="bulb" style={{ ...place(lamp.bulb), filter }} />
          </div>
        );
      })}
      {METERS.map((m, i) => (
        <div key={i} className="meter" style={{ ...place(m), opacity: lit ? levels[i] : 0 }} />
      ))}
      <div className={`jam-led${jammed ? ' on' : ''}`} data-zaria={A.jamLed} style={place(JAM_LED)} />
    </div>
  );
}
