import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
import type { MapProps } from './view/MapScreen.tsx';

const PRESETS = ['глушій-2', 'глушій', 'варта', 'основний', 'рівний', 'обхідник'];
const MODES: Mode[] = ['truth', 'belief', 'both'];

const STYLES = Object.fromEntries((Object.keys(DEVICES) as Device[]).map((d) => [d, place(DEVICES[d])])) as Record<Device, ReturnType<typeof place>>;

function Dev({ at, children, className }: { at: Device; children?: ReactNode; className?: string }) {
  return (
    <div className={'dev ' + at + (className ? ' ' + className : '')} style={STYLES[at]}>
      {children}
    </div>
  );
}

const A = memo(function A({ name, v, label }: { name: string; v: string | undefined; label?: string }) {
  return (
    <span className="a">
      {label ? <i>{label}</i> : null}
      <b data-zaria={name}>{v ?? ''}</b>
    </span>
  );
});

function Field({ name, value, placeholder, commit }: { name: string; value: string; placeholder: string; commit: (s: string) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(value);
  }
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

const Meter = memo(function Meter({ value, max }: { value: number; max: number }) {
  const angle = -48 + 96 * Math.min(1, Math.max(0, value / max));
  return <div className="needle" style={{ transform: 'rotate(' + angle + 'deg)' }} />;
});

const keyOf = (pack: string | null, match: number, t: number): string => pack + ':' + match + ':' + t;

type Answer = { key: string; at: TruthAt } | null;
let answer: Answer = null;
const listeners = new Set<() => void>();
const answers = {
  set(a: Answer): void {
    answer = a;
    for (const f of listeners) f();
  },
  subscribe(f: () => void): () => void {
    listeners.add(f);
    return () => listeners.delete(f);
  },
  get: (): Answer => answer,
};

type Pair = { a: PackData; b: PackData } | null;
let last: { view: View; cur: PackData | null; at: TruthAt | null; pair: Pair; out: Record<string, string> } | null = null;
function derived(view: View, cur: PackData | null, at: TruthAt | null, pair: Pair): Record<string, string> {
  if (last && last.view === view && last.cur === cur && last.at === at && last.pair === pair) return last.out;
  const out = derive(view, cur, at, pair);
  last = { view, cur, at, pair, out };
  return out;
}

function useTruth(view: View): TruthAt | null {
  const a = useSyncExternalStore(answers.subscribe, answers.get);
  return a && a.key === keyOf(view.pack, view.match, view.tick) ? a.at : null;
}

const TA = memo(function TA({ name, label, view, cur, pair }: { name: string; label?: string; view: View; cur: PackData | null; pair: Pair }) {
  const at = useTruth(view);
  return <A name={name} v={derived(view, cur, at, pair)[name]} label={label} />;
});

const LiveMap = memo(function LiveMap(props: Omit<MapProps, 'truth'> & { view: View }) {
  const at = useTruth(props.view);
  const shown = useRef<TruthAt | null>(null);
  if (at) shown.current = at;
  const { view: _, ...rest } = props;
  return <MapScreen {...rest} truth={shown.current?.owners ?? null} />;
});
const m0 = (d: PackData | null, match: number) => d?.matches[match - 1] ?? null;

export function App() {
  const host = useRef<Host | null>(null);
  const truth = useRef<TruthClient | null>(null);
  const [packs, setPacks] = useState<PackEntry[]>([]);
  const [data, setData] = useState<Record<string, PackData>>({});
  const [view, setView] = useState<View>(initial());
  const [playing, setPlaying] = useState(false);
  const [preset, setPreset] = useState(PRESETS[0] ?? '');
  const [big, setBig] = useState(false);
  const opened = useRef(new Set<string>());
  const liveOn = useRef(false);
  const readySent = useRef(false);

  const set = (patch: Partial<View>): void => setView((v) => ((Object.keys(patch) as (keyof View)[]).every((k) => v[k] === patch[k]) ? v : { ...v, ...patch }));
  const cur = view.pack ? data[view.pack] ?? null : null;
  const slotNo = (pack: string, match: number): number => (Object.keys(data).indexOf(pack) + 1) * 10 + match;

  useEffect(() => {
    const t = new TruthClient();
    truth.current = t;
    t.onAnswer = (a) => answers.set(a);
    t.onLive = (tick, score) => setView((v) => (v.live ? { ...v, tick, live: { ...v.live, score } } : v));
    const toBytes = (x: unknown): Uint8Array => (x instanceof Uint8Array ? x : x instanceof ArrayBuffer ? new Uint8Array(x) : new Uint8Array(x as number[]));
    const startLive = (h: Host): void => {
      const L = h.live();
      if (!L) return;
      t.send({ kind: 'live-start', manifest: toBytes(L.manifest), bots: L.bots, roster: L.roster, ticks: L.ticks, seat: L.seat });
      setView((v) => ({ ...v, pack: null, tick: 0, focus: L.roster[L.seat] ?? '', live: { cap: 0, state: 'live', shares: null, score: null } }));
      liveOn.current = true;
    };
    void connect('Оперативна').then((h) => {
      host.current = h;
      h.on('live', () => startLive(h));
      h.on('tick', (m) => {
        if (!liveOn.current) return;
        const submits = ((m['submits'] as [string, unknown][]) ?? []).map(([slot, frame]) => [slot, toBytes(frame)] as [string, Uint8Array]);
        const denies = (m['denies'] as [string, number, number][]) ?? [];
        t.send({ kind: 'live-tick', t: Number(m['t']), submits, denies });
        const cap = Number(m['cap'] ?? m['t']);
        setView((v) => (v.live ? { ...v, live: { ...v.live, cap } } : v));
      });
      h.on('end', (m) => {
        const shares = (m['shares'] as number[]) ?? [];
        t.send({ kind: 'live-end', shares });
        setView((v) => (v.live ? { ...v, live: { ...v.live, state: 'end', shares, cap: Number(m['t'] ?? v.live.cap) } } : v));
      });
      if (h.mode === 'live') startLive(h);
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

  const sparkSlot = cur ? slotOf(view, cur) : '';
  const spark = useMemo(() => (m0(cur, view.match) && cur ? channelOf(m0(cur, view.match)!, sparkSlot).series.map((p) => p.t + ',' + (40 - Math.min(40, p.bytes / 8))).join(' ') : ''), [cur, view.match, sparkSlot]);
  const pa = data['preset-a'];
  const pb = data['preset-b'];
  const pair = useMemo(() => (pa && pb ? { a: pa, b: pb } : null), [pa, pb]);
  const v = useMemo(() => derive(view, cur, null, pair), [view, cur, pair]);

  useEffect(() => {
    if (!view.live) return;
    const id = requestAnimationFrame(() => host.current?.ready(view.tick));
    return () => cancelAnimationFrame(id);
  }, [view.live, view.tick]);

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
          <span className="flap"><A name="match" v={v['match']} label="ПАРТІЯ" /> <span className="a"><i>ТАКТ</i><b>{String(view.tick).padStart(4, '0')}</b></span></span>
          <span className="flap"><A name="focus" v={v['focus']} /> <TA name="score" view={view} cur={cur} pair={pair} /></span>
        </Dev>
        <Dev at="onAir" className={view.live ? 'lit' : ''}>
          <span className="sign">{view.live ? (view.live.state === 'end' ? 'КІНЕЦЬ' : 'В ЕФІРІ') : 'ЗАПИС'}</span>
          <A name="live-state" v={v['live-state']} />
        </Dev>
        <Dev at="vu1"><Meter value={Number(v['bytes'] || 0)} max={320} /><A name="bytes" v={v['bytes']} label="байти" /></Dev>
        <Dev at="vu2"><Meter value={Number(v['orders'] || 0)} max={10} /><A name="orders" v={v['orders']} label="команди" /></Dev>
        <Dev at="vu3"><Meter value={Number(v['denied'] || 0)} max={4} /><A name="denied" v={v['denied']} label="відмови" /></Dev>
        <Dev at="wall">
          <A name="shares" v={v['shares']} label="частки" />
          <TA name="needles" view={view} cur={cur} pair={pair} label="голки горять" />
        </Dev>
        <Dev at="left" className="mon">
          <span className="title">РОЗВІДКА</span>
          <A name="mode" v={v['mode']} label="шар" />
          <A name="cell" v={v['cell']} label="сота" />
          <TA name="cell-owner-truth" view={view} cur={cur} pair={pair} label="правда" />
          <A name="cell-owner-belief" v={v['cell-owner-belief']} label="віра" />
          <A name="ghost-cell" v={v['ghost-cell']} label={'примара ' + (view.unit || '')} />
          <A name="ghost-age" v={v['ghost-age']} label="вік" />
          <TA name="diff-count" view={view} cur={cur} pair={pair} label="розбіжність" />
          <A name="dark-count" v={v['dark-count']} label="мовчать" />
        </Dev>
        <Dev at="round" className={'screen' + (big ? ' big' : '')}>
          <div className="scope" onClick={() => !big && setBig(true)}>
            <LiveMap view={view} needles={m?.needles ?? []} belief={belief} mode={view.mode} cell={view.cell} ghost={v['ghost-cell'] ?? ''} big={big} onPick={(c) => set({ cell: c })} />
          </div>
          {big ? <button className="close" onClick={() => setBig(false)}>×</button> : null}
        </Dev>
        <Dev at="right" className="mon">
          <span className="title">КАНАЛ</span>
          <svg className="spark" viewBox="0 0 1200 40" preserveAspectRatio="none">
            <polyline fill="none" stroke="currentColor" strokeWidth="6" points={spark} />
            <line x1={view.tick} x2={view.tick} y1="0" y2="40" stroke="#ffffff" strokeWidth="4" />
          </svg>
          <A name="deny-word" v={v['deny-word']} label={'відмова #' + view.order} />
          <A name="deny-top-tick" v={v['deny-top-tick']} label="найгірший такт" />
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
        <Dev at="nixie"><A name="tick" v={v['tick']} /></Dev>
        <Dev at="lamps">
          <span className={'lamp ' + status} />
          <span className={'lamp ' + (view.live ? 'red' : 'off')} />
          <A name="live-lag" v={v['live-lag']} label="відстав." />
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
          <A name="ab-winner" v={v['ab-winner']} label="краще" />
          <A name="ab-diff" v={v['ab-diff']} label="різниця" />
          <A name="ab-top" v={v['ab-top']} label="стаття" />
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
          <A name="promote-status" v={v['promote-status']} label="відповідь" />
        </Dev>
      </div>
    </div>
  );
}
