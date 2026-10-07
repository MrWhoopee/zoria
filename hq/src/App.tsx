import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import room from './assets/room.webp';
import { parseCell } from './anchors.ts';
import { loadPack } from './data.ts';
import { connect } from './host.ts';
import type { Host, PackEntry } from './host.ts';
import { DEVICES, place } from './layout.ts';
import type { Device } from './layout.ts';
import { channelOf, derive, focusNick, initial, slotOf } from './model/derive.ts';
import type { Mode, PackData, View } from './model/derive.ts';
import type { TruthAt } from './model/truth.ts';
import { TruthClient } from './truthClient.ts';
import { MapScreen } from './view/MapScreen.tsx';

type Values = Record<string, string>;
const PRESETS = ['глушій-2', 'глушій', 'варта', 'основний', 'рівний', 'обхідник'];
const MODES: Mode[] = ['truth', 'belief', 'both'];

function Dev({ at, children, className }: { at: Device; children?: ReactNode; className?: string }) {
  return (
    <div className={'dev ' + at + (className ? ' ' + className : '')} style={place(DEVICES[at])}>
      {children}
    </div>
  );
}

function A({ name, v, label }: { name: string; v: Values; label?: string }) {
  return (
    <span className="a">
      {label ? <i>{label}</i> : null}
      <b data-zaria={name}>{v[name] ?? ''}</b>
    </span>
  );
}

function Field({ name, value, placeholder, commit }: { name: string; value: string; placeholder: string; commit: (s: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      data-zaria={name}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        commit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(e.currentTarget.value);
      }}
    />
  );
}

function Meter({ value, max }: { value: number; max: number }) {
  const angle = -48 + 96 * Math.min(1, Math.max(0, value / max));
  return <div className="needle" style={{ transform: 'rotate(' + angle + 'deg)' }} />;
}

const keyOf = (pack: string | null, match: number, t: number): string => pack + ':' + match + ':' + t;

export function App() {
  const host = useRef<Host | null>(null);
  const truth = useRef<TruthClient | null>(null);
  const [packs, setPacks] = useState<PackEntry[]>([]);
  const [data, setData] = useState<Record<string, PackData>>({});
  const [view, setView] = useState<View>(initial());
  const [answer, setAnswer] = useState<{ key: string; at: TruthAt } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [preset, setPreset] = useState(PRESETS[0] ?? '');
  const [big, setBig] = useState(false);
  const opened = useRef(new Set<string>());
  const readySent = useRef(false);

  const set = (patch: Partial<View>): void => setView((v) => ({ ...v, ...patch }));
  const cur = view.pack ? data[view.pack] ?? null : null;
  const slotNo = (pack: string, match: number): number => (Object.keys(data).indexOf(pack) + 1) * 10 + match;

  useEffect(() => {
    const t = new TruthClient();
    truth.current = t;
    t.onAnswer = (a) => setAnswer(a);
    void connect('Оперативна').then((h) => {
      host.current = h;
      const list = h.packs();
      setPacks(list);
      if (h.mode === 'record' && list.length > 0) {
        void Promise.all(list.map((p) => loadPack(h, p))).then((all) => {
          const byId: Record<string, PackData> = {};
          for (const d of all) byId[d.id] = d;
          setData(byId);
          const first = list.find((p) => p.id === 'reference') ?? list[0];
          setView((v) => ({ ...v, pack: first?.id ?? null }));
        });
      }
    });
  }, []);

  useEffect(() => {
    const t = truth.current;
    if (!t || !cur || !view.pack) return;
    cur.matches.forEach((m, i) => {
      const k = view.pack + ':' + (i + 1);
      if (opened.current.has(k)) return;
      opened.current.add(k);
      t.open(slotNo(view.pack ?? '', i + 1), m.bytes);
    });
  }, [cur, view.pack]);

  useEffect(() => {
    const t = truth.current;
    if (!t || !cur || !view.pack || view.live) return;
    t.ask(slotNo(view.pack, view.match), view.tick, keyOf(view.pack, view.match, view.tick));
  }, [cur, view.pack, view.match, view.tick, view.live]);

  useEffect(() => {
    if (!playing || !cur) return;
    let id = 0;
    const step = (): void => {
      setView((v) => {
        const end = cur.matches[v.match - 1]?.ticks ?? 1200;
        if (v.tick >= end) {
          setPlaying(false);
          return v;
        }
        return { ...v, tick: v.tick + 1 };
      });
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [playing, cur]);

  const truthAt = answer && answer.key === keyOf(view.pack, view.match, view.tick) ? answer.at : null;
  const pair = data['preset-a'] && data['preset-b'] ? { a: data['preset-a'], b: data['preset-b'] } : null;
  const v = useMemo(() => derive(view, cur, truthAt, pair), [view, cur, truthAt, pair]);

  useEffect(() => {
    if (readySent.current || !cur) return;
    readySent.current = true;
    requestAnimationFrame(() => host.current?.ready(view.tick));
  }, [cur, view.tick]);

  const m = cur?.matches[view.match - 1] ?? null;
  const nick = focusNick(view, cur);
  const belief = m?.diary && nick === cur?.summary.belief?.nick ? m.diary.at(view.tick).own : null;
  const roster = m?.roster ?? [];
  const status = !cur ? 'red' : playing ? 'green' : 'amber';

  const goTick = (s: string): void => {
    const n = Number(s.trim());
    if (!Number.isInteger(n)) return;
    const end = m?.ticks ?? 1200;
    set({ tick: Math.max(0, Math.min(end, n)) });
  };
  const goMatch = (s: string): void => {
    const n = Number(s);
    if (n >= 1 && n <= 3) set({ match: n });
  };
  const goCell = (s: string): void => {
    const c = parseCell(s);
    if (c) set({ cell: c.q + ',' + c.r });
  };
  const goOrder = (s: string): void => {
    const n = Number(s.trim());
    if (Number.isInteger(n) && n >= 0) set({ order: n });
  };
  const promote = (): void => {
    const h = host.current;
    if (!h) return;
    void h.promote(preset).then((r) => set({ promote: String(r.status) }));
  };

  return (
    <div className="stage">
      <div className={'room' + (playing ? ' playing' : '')}>
        <img className="photo" src={room} alt="" draggable={false} />
        <Dev at="board">
          <span className="flap"><A name="match" v={v} label="ПАРТІЯ" /> <span className="a"><i>ТАКТ</i><b>{String(view.tick).padStart(4, '0')}</b></span></span>
          <span className="flap"><A name="focus" v={v} /> <A name="score" v={v} /></span>
        </Dev>
        <Dev at="onAir" className={view.live ? 'lit' : ''}>
          <span className="sign">{view.live ? (view.live.state === 'end' ? 'КІНЕЦЬ' : 'В ЕФІРІ') : 'ЗАПИС'}</span>
          <A name="live-state" v={v} />
        </Dev>
        <Dev at="vu1"><Meter value={Number(v['bytes'] || 0)} max={320} /><A name="bytes" v={v} label="байти" /></Dev>
        <Dev at="vu2"><Meter value={Number(v['orders'] || 0)} max={10} /><A name="orders" v={v} label="команди" /></Dev>
        <Dev at="vu3"><Meter value={Number(v['denied'] || 0)} max={4} /><A name="denied" v={v} label="відмови" /></Dev>
        <Dev at="wall">
          <A name="shares" v={v} label="частки" />
          <A name="needles" v={v} label="голки горять" />
        </Dev>
        <Dev at="left" className="mon">
          <span className="title">РОЗВІДКА</span>
          <A name="mode" v={v} label="шар" />
          <A name="cell" v={v} label="сота" />
          <A name="cell-owner-truth" v={v} label="правда" />
          <A name="cell-owner-belief" v={v} label="віра" />
          <A name="ghost-cell" v={v} label={'примара ' + (view.unit || '')} />
          <A name="ghost-age" v={v} label="вік" />
          <A name="diff-count" v={v} label="розбіжність" />
          <A name="dark-count" v={v} label="мовчать" />
        </Dev>
        <Dev at="round" className={'screen' + (big ? ' big' : '')}>
          <div className="scope" onClick={() => !big && setBig(true)}>
            <MapScreen needles={m?.needles ?? []} truth={truthAt?.owners ?? null} belief={belief} mode={view.mode} cell={view.cell} ghost={v['ghost-cell'] ?? ''} big={big} onPick={(c) => set({ cell: c })} />
          </div>
          {big ? <button className="close" onClick={() => setBig(false)}>×</button> : null}
        </Dev>
        <Dev at="right" className="mon">
          <span className="title">КАНАЛ</span>
          <svg className="spark" viewBox="0 0 1200 40" preserveAspectRatio="none">
            <polyline fill="none" stroke="currentColor" strokeWidth="6" points={(m && cur ? channelOf(m, slotOf(view, cur)).series : []).map((p) => p.t + ',' + (40 - Math.min(40, p.bytes / 8))).join(' ')} />
            <line x1={view.tick} x2={view.tick} y1="0" y2="40" stroke="#ffffff" strokeWidth="4" />
          </svg>
          <A name="deny-word" v={v} label={'відмова #' + view.order} />
          <A name="deny-top-tick" v={v} label="найгірший такт" />
        </Dev>
        <Dev at="reels" className="reels">
          <span className="reel l" />
          <span className="reel r" />
          <div className="deck">
            <button onClick={() => setPlaying(!playing)}>{playing ? '❚❚' : '▶'}</button>
            <button onClick={() => goTick(String(view.tick + 1))}>+1</button>
            <input type="range" min={0} max={m?.ticks ?? 1200} value={view.tick} onChange={(e) => goTick(e.target.value)} />
          </div>
        </Dev>
        <Dev at="nixie"><A name="tick" v={v} /></Dev>
        <Dev at="lamps">
          <span className={'lamp ' + status} />
          <span className={'lamp ' + (view.live ? 'red' : 'off')} />
          <A name="live-lag" v={v} label="відстав." />
        </Dev>
        <Dev at="keypad" className="keys">
          <Field name="go-tick" value={String(view.tick)} placeholder="такт" commit={goTick} />
          <Field name="go-cell" value={view.cell} placeholder="сота q,r" commit={goCell} />
          <Field name="go-unit" value={view.unit} placeholder="машина" commit={(s) => set({ unit: s.trim() })} />
          <Field name="go-order" value={String(view.order)} placeholder="команда" commit={goOrder} />
        </Dev>
        <Dev at="knob1"><select data-zaria="go-match" value={view.match} onChange={(e) => goMatch(e.target.value)}>{[1, 2, 3].map((n) => <option key={n} value={n}>{'партія ' + n}</option>)}</select></Dev>
        <Dev at="knob2"><select data-zaria="go-mode" value={view.mode} onChange={(e) => set({ mode: e.target.value as Mode })}>{MODES.map((x) => <option key={x} value={x}>{x}</option>)}</select></Dev>
        <Dev at="knob3"><select data-zaria="go-focus" value={nick} onChange={(e) => set({ focus: e.target.value })}>{(roster.length ? roster : [nick]).map((n) => <option key={n} value={n}>{n}</option>)}</select></Dev>
        <Dev at="cassettes">
          <A name="ab-winner" v={v} label="краще" />
          <A name="ab-diff" v={v} label="різниця" />
          <A name="ab-top" v={v} label="стаття" />
        </Dev>
        <Dev at="drawer" className="drawer">
          {packs.map((p) => (
            <button key={p.id} className={p.id === view.pack ? 'on' : ''} data-zaria="go-pack" data-zaria-value={p.id} onClick={() => set({ pack: p.id })}>
              {p.id}
            </button>
          ))}
        </Dev>
        <Dev at="lever" className={'lever s' + view.promote}>
          <select data-zaria="go-preset" value={preset} onChange={(e) => setPreset(e.target.value)}>
            {PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button data-zaria="do-promote" onClick={promote}>в бій</button>
          <A name="promote-status" v={v} label="відповідь" />
        </Dev>
      </div>
    </div>
  );
}
