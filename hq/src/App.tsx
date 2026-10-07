import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import room from './assets/room.webp';
import { connect } from './host.ts';
import type { Host, PackEntry } from './host.ts';
import { DEVICES, place } from './layout.ts';
import type { Device } from './layout.ts';

export type Values = Record<string, string>;

function Dev({ at, children, className }: { at: Device; children?: ReactNode; className?: string }) {
  return (
    <div className={'dev ' + (className ?? at)} style={place(DEVICES[at])}>
      {children}
    </div>
  );
}

export function A({ name, v, label }: { name: string; v: Values; label?: string }) {
  return (
    <span className="a">
      {label ? <i>{label}</i> : null}
      <b data-zaria={name}>{v[name] ?? ''}</b>
    </span>
  );
}

const PRESETS = ['глушій-2', 'глушій', 'варта', 'основний', 'рівний', 'обхідник'];

export function App() {
  const host = useRef<Host | null>(null);
  const [packs, setPacks] = useState<PackEntry[]>([]);
  const [v, setV] = useState<Values>({});
  const [preset, setPreset] = useState(PRESETS[0] ?? '');
  const put = (patch: Values): void => setV((old) => ({ ...old, ...patch }));

  useEffect(() => {
    let off: (() => void) | null = null;
    void connect('Оперативна').then((h) => {
      host.current = h;
      setPacks(h.packs());
      off = h.on('record', () => setPacks(h.packs()));
      if (h.mode === 'record') h.ready(0);
    });
    return () => off?.();
  }, []);

  const promote = (): void => {
    const h = host.current;
    if (!h) return;
    void h.promote(preset).then((r) => put({ 'promote-status': String(r.status) }));
  };

  return (
    <div className="stage">
      <div className="room">
        <img className="photo" src={room} alt="" draggable={false} />
        <Dev at="board">
          <A name="match" v={v} label="партія" />
          <A name="focus" v={v} label="фокус" />
          <A name="score" v={v} label="рахунок" />
        </Dev>
        <Dev at="onAir">
          <A name="live-state" v={v} />
        </Dev>
        <Dev at="vu1"><A name="bytes" v={v} label="байти" /></Dev>
        <Dev at="vu2"><A name="orders" v={v} label="команди" /></Dev>
        <Dev at="vu3"><A name="denied" v={v} label="відмови" /></Dev>
        <Dev at="wall">
          <A name="shares" v={v} label="частки" />
          <A name="needles" v={v} label="голки" />
        </Dev>
        <Dev at="left" className="mon left">
          <A name="mode" v={v} label="шар" />
          <A name="cell" v={v} label="сота" />
          <A name="cell-owner-truth" v={v} label="правда" />
          <A name="cell-owner-belief" v={v} label="віра" />
          <A name="ghost-cell" v={v} label="примара" />
          <A name="ghost-age" v={v} label="вік" />
          <A name="diff-count" v={v} label="розбіжн." />
          <A name="dark-count" v={v} label="мовчать" />
        </Dev>
        <Dev at="round" className="screen" />
        <Dev at="right" className="mon right">
          <A name="deny-word" v={v} label="відмова" />
          <A name="deny-top-tick" v={v} label="найгірший такт" />
        </Dev>
        <Dev at="nixie"><A name="tick" v={v} /></Dev>
        <Dev at="lamps">
          <A name="live-lag" v={v} label="відстав." />
        </Dev>
        <Dev at="cassettes">
          <A name="ab-winner" v={v} label="краще" />
          <A name="ab-diff" v={v} label="різниця" />
          <A name="ab-top" v={v} label="стаття" />
        </Dev>
        <Dev at="keypad" className="keys">
          <input data-zaria="go-tick" placeholder="такт" />
          <input data-zaria="go-cell" placeholder="q,r" />
          <input data-zaria="go-unit" placeholder="машина" />
          <input data-zaria="go-order" placeholder="команда" />
        </Dev>
        <Dev at="knob1"><select data-zaria="go-match" defaultValue="1">{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></Dev>
        <Dev at="knob2"><select data-zaria="go-mode" defaultValue="truth">{['truth', 'belief', 'both'].map((m) => <option key={m} value={m}>{m}</option>)}</select></Dev>
        <Dev at="knob3"><select data-zaria="go-focus" /></Dev>
        <Dev at="drawer" className="drawer">
          {packs.map((p) => (
            <button key={p.id} data-zaria="go-pack" data-zaria-value={p.id}>
              {p.id}
            </button>
          ))}
        </Dev>
        <Dev at="lever" className="lever">
          <select data-zaria="go-preset" value={preset} onChange={(e) => setPreset(e.target.value)}>
            {PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button data-zaria="do-promote" onClick={promote}>в бій</button>
          <A name="promote-status" v={v} />
        </Dev>
      </div>
    </div>
  );
}
