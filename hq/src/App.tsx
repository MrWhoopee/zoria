import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import room from './assets/room.webp';
import { parseCell } from './anchors.ts';
import { loadPack } from './data.ts';
import { connect } from './host.ts';
import type { Host, PackEntry } from './host.ts';
import { DECK, DEVICES, ENGRAVE, KNOBS, LAMPS, NOTE, PLATES, REELS, TUBES, place } from './layout.ts';
import type { Device } from './layout.ts';
import { channelOf, derive, focusNick, initial, slotOf } from './model/derive.ts';
import type { LiveView, Mode, PackData, View } from './model/derive.ts';
import type { TruthAt } from './model/truth.ts';
import { TruthClient } from './truthClient.ts';
import { MapPainter, MapScreen } from './view/MapScreen.tsx';
import type { MapState } from './view/MapScreen.tsx';
import { Board, BoardPainter, Spot, Tubes } from './view/Devices.tsx';
import type { Reg } from './view/Devices.tsx';
import { Desk } from './view/desk.ts';
import { Sound } from './sound/engine.ts';

const PRESETS = ['глушій-6', 'глушій-5', 'глушій-4', 'глушій-3', 'глушій-2', 'глушій', 'варта', 'основний', 'рівний', 'обхідник'];
const MODES: Mode[] = ['truth', 'belief', 'both'];
const PLAY_RATE = 30;
const PROMOTE_NAME: Record<string, string> = { '': 'вибери пресет і тисни', '-': 'вибери пресет і тисни', '…': 'чекаю відповідь бота', '200': 'бот прийняв пресет', '409': 'відмова: іде прогін або заморожено', '503': 'бот не відповідає', '400': 'бот не знає такого пресета', err: 'господар не відповів' };
const MODE_NAME: Record<Mode, string> = { truth: 'правда', belief: 'віра', both: 'обидва' };
const METERS: [string, number][] = [['bytes', 320], ['orders', 10], ['denied', 4]];
const VALUE_ANCHORS = new Set(['match', 'tick', 'focus', 'score', 'needles', 'shares']);
const TRUTH_ANCHORS = new Set(['score', 'needles', 'cell-owner-truth', 'diff-count']);

const STYLES = Object.fromEntries((Object.keys(DEVICES) as Device[]).map((d) => [d, place(DEVICES[d])])) as Record<Device, ReturnType<typeof place>>;

function Dev({ at, children, className }: { at: Device; children?: ReactNode; className?: string }) {
  return (
    <div className={'dev ' + at + (className ? ' ' + className : '')} style={STYLES[at]}>
      {children}
    </div>
  );
}

const A = memo(function A({ name, label, reg }: { name: string; label?: string; reg: Reg }) {
  return (
    <span className="a">
      {label ? <i>{label}</i> : null}
      <b data-zaria={name} ref={reg(name)} />
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
      title={placeholder}
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

const keyOf = (pack: string | null, match: number, t: number): string => pack + ':' + match + ':' + t;

type Pair = { a: PackData; b: PackData } | null;

interface Act {
  set: (p: Partial<View>) => void;
  goMatch: (s: string) => void;
  goTick: (s: string) => void;
  promote: () => void;
  setPreset: (p: string) => void;
  sfx: Sound;
}

const Reels = memo(function Reels() {
  return (
    <>
      {REELS.map((b, i) => (
        <Spot key={i} b={b} className="reel">
          <i className="spokes" />
        </Spot>
      ))}
    </>
  );
});

const NICK_COLORS = ['#ffb347', '#4fe3d4', '#f27be8'];

const Names = memo(function Names({ roster }: { roster: string[] }) {
  return (
    <div className="names">
      {roster.map((n, i) => (
        <span key={n} style={{ color: NICK_COLORS[i] }}>● {n}</span>
      ))}
    </div>
  );
});

const Note = memo(function Note() {
  return (
    <Spot b={NOTE} className="note">
      <div className="paper">
        <span>▲ ткач</span>
        <span>◆ клинок</span>
        <span>■ Ключник</span>
        <span className="red">✕ глушіння</span>
      </div>
      <i className="tape" />
    </Spot>
  );
});

const Knobs = memo(function Knobs({ match, mode, nick, roster, live, act }: { match: number; mode: Mode; nick: string; roster: string[]; live: boolean; act: Act }) {
  return (
    <>
      <Spot b={KNOBS.knob1} className={'knob k' + (match - 1)}>
        <select data-zaria="go-match" value={match} onChange={(e) => { act.sfx.knob(); act.goMatch(e.target.value); e.currentTarget.blur(); }}>{[1, 2, 3].map((n) => <option key={n} value={n}>{'партія ' + n}</option>)}</select>
      </Spot>
      <Spot b={KNOBS.knob2} className={'knob k' + MODES.indexOf(mode)}>
        <select data-zaria="go-mode" value={mode} onChange={(e) => { act.sfx.knob(); act.set({ mode: e.target.value as Mode }); e.currentTarget.blur(); }}>{MODES.map((x) => <option key={x} value={x}>{MODE_NAME[x]}</option>)}</select>
      </Spot>
      <Spot b={KNOBS.knob3} className={'knob k' + Math.max(0, roster.indexOf(nick))}>
        <select data-zaria="go-focus" value={nick} onChange={(e) => { act.sfx.knob(); act.set({ focus: e.target.value }); e.currentTarget.blur(); }}>{(roster.length ? roster : [nick]).map((n) => <option key={n} value={n}>{n}</option>)}</select>
      </Spot>
      <Spot b={PLATES.knob1} className="plate"><i>ПАРТІЯ</i><b>{live ? 'ефір' : match}</b></Spot>
      <Spot b={PLATES.knob2} className="plate"><i>ШАР</i><b>{MODE_NAME[mode]}</b></Spot>
      <Spot b={PLATES.knob3} className="plate"><i>ЧИЇМИ ОЧИМА</i><b>{nick}</b></Spot>
    </>
  );
});

const Drawer = memo(function Drawer({ packs, pack, act }: { packs: PackEntry[]; pack: string | null; act: Act }) {
  return (
    <Dev at="drawer" className="drawer">
      {packs.map((p) => (
        <button key={p.id} className={p.id === pack ? 'on' : ''} data-zaria="go-pack" data-zaria-value={p.id} title={p.title} onClick={() => { if (p.id !== pack) act.sfx.cassette(); act.set({ pack: p.id }); }}>
          {p.title || p.id}
        </button>
      ))}
    </Dev>
  );
});

const Lever = memo(function Lever({ preset, status, act, reg }: { preset: string; status: string; act: Act; reg: Reg }) {
  return (
    <Dev at="lever" className={'lever s' + status}>
      <select data-zaria="go-preset" value={preset} title="пресет для живого бота" onChange={(e) => { act.sfx.knob(); act.setPreset(e.target.value); e.currentTarget.blur(); }}>
        {PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <button data-zaria="do-promote" title="попросити живого бота грати цим пресетом з наступної партії" onClick={act.promote}>в бій</button>
      <A name="promote-status" label="відповідь" reg={reg} />
      <span className="said">{PROMOTE_NAME[status] ?? 'відповідь ' + status}</span>
    </Dev>
  );
});

const Deck = memo(function Deck({ playing, ticks, toggle, act, part }: { playing: boolean; ticks: number; toggle: () => void; act: Act; part: Desk['part'] }) {
  return (
    <>
      <Spot b={DECK.play} className="deckBtn">
        <button title="пробіл" onClick={toggle}>{playing ? '❚❚' : '▶'}</button>
      </Spot>
      <Spot b={DECK.step} className="deckBtn">
        <button onClick={() => act.goTick('+1')}>+1</button>
      </Spot>
      <Spot b={DECK.slider} className="deckSlider">
        <input ref={part('slider')} type="range" min={0} max={ticks} defaultValue={0} onChange={(e) => act.goTick(e.target.value)} />
      </Spot>
    </>
  );
});

export function App() {
  const host = useRef<Host | null>(null);
  const truth = useRef<TruthClient | null>(null);
  const [packs, setPacks] = useState<PackEntry[]>([]);
  const [data, setData] = useState<Record<string, PackData>>({});
  const [view, setView] = useState<View>(initial());
  const [playing, setPlaying] = useState(false);
  const [preset, setPreset] = useState(PRESETS[0] ?? '');
  const [cam, setCam] = useState<{ zoom: number; style: Record<string, string> } | null>(null);
  const zoom = cam?.zoom ?? 0;
  const [lands, setLands] = useState<Record<number, [string, string][]>>({});
  const roomRef = useRef<HTMLDivElement | null>(null);
  const opened = useRef(new Set<string>());
  const liveOn = useRef(false);
  const readySent = useRef(false);
  const desk = useRef(new Desk()).current;
  const painters = useRef({ board: new BoardPainter(), map: new MapPainter() }).current;
  const tickRef = useRef(0);
  const liveRef = useRef<LiveView>({ cap: 0, state: 'live', shares: null, score: null });
  const answer = useRef<{ key: string; at: TruthAt } | null>(null);
  const shownTruth = useRef<TruthAt | null>(null);
  const asked = useRef('');
  const mapSeen = useRef<unknown[]>([]);
  const scoreText = useRef('');
  const sound = useRef(new Sound()).current;
  const [muted, setMuted] = useState(sound.muted);
  sound.onMute = setMuted;

  const viewRef = useRef(view);
  viewRef.current = view;
  const set = (patch: Partial<View>): void => {
    const same = (v: View): boolean => (Object.keys(patch) as (keyof View)[]).every((k) => v[k] === patch[k]);
    if (same(viewRef.current)) return;
    setView((v) => (same(v) ? v : { ...v, ...patch }));
  };
  const cur = view.pack ? data[view.pack] ?? null : null;
  const slotNo = (pack: string, match: number): number => (Object.keys(data).indexOf(pack) + 1) * 10 + match;
  const pa = data['preset-a'];
  const pb = data['preset-b'];
  const pair = useMemo<Pair>(() => (pa && pb ? { a: pa, b: pb } : null), [pa, pb]);
  const m = cur?.matches[view.match - 1] ?? null;
  const nick = focusNick(view, cur);
  const roster = m?.roster ?? [];

  const st = useRef({ cur, pair, lands, zoom, playing, slotNo, nick, m });
  st.current = { cur, pair, lands, zoom, playing, slotNo, nick, m };

  const paint = (): void => {
    const s = st.current;
    const base = viewRef.current;
    const tick = tickRef.current;
    const view: View = { ...base, tick, live: base.live ? liveRef.current : null };
    const t = truth.current;
    if (t && s.cur && view.pack && !view.live) {
      const key = keyOf(view.pack, view.match, tick);
      if (asked.current !== key) {
        asked.current = key;
        t.ask(s.slotNo(view.pack, view.match), tick, key);
      }
    }
    const key = view.live ? 'live:' + tick : keyOf(view.pack, view.match, tick);
    const at = answer.current && answer.current.key === key ? answer.current.at : null;
    if (at) shownTruth.current = at;
    const d = derive(view, s.cur, at, s.pair);

    const waiting = !at && !view.live;
    for (const [name, el] of desk.anchors) {
      if (waiting && TRUTH_ANCHORS.has(name)) continue;
      const val = d[name] ?? '';
      if (!desk.changed('a:' + name, val)) continue;
      if (VALUE_ANCHORS.has(name)) el.setAttribute('data-zaria-value', val);
      else el.textContent = val;
    }
    for (const [name, digits] of [['needles', d['needles'] ?? ''], ['shares', (d['shares'] ?? '').split(',').map((n) => n.slice(-1)).join('')]] as const) {
      const el = desk.anchors.get(name);
      if (waiting && name === 'needles') continue;
      if (!el || !desk.changed('t:' + name, digits)) continue;
      const tubes = el.children;
      const padded = digits.padStart(tubes.length, ' ').slice(-tubes.length);
      for (let i = 0; i < tubes.length; i++) {
        const ch = padded[i] ?? ' ';
        const tube = tubes[i] as HTMLElement;
        if (tube.textContent !== ch) tube.textContent = ch === ' ' ? '' : ch;
      }
    }

    const boardCv = desk.parts.get('board') as HTMLCanvasElement | undefined;
    const bs = desk.sizes.get('board');
    if (!waiting) scoreText.current = (d['score'] ?? '').padStart(6, ' ');
    if (boardCv && bs) {
      const flips = painters.board.draw(boardCv, bs.w, bs.h, { match: view.live ? 'ЕФІР' : 'П ' + view.match, tick: 'Т ' + String(tick).padStart(4, '0'), focus: s.nick.toUpperCase(), score: scoreText.current });
      if (flips > 0) sound.flaps(flips);
    }
    sound.airLit(!!view.live && view.live.state === 'live');

    for (const [name, max] of METERS) {
      const el = desk.parts.get('vu-' + name);
      const angle = String(Math.round(-48 + 96 * Math.min(1, Math.max(0, Number(d[name] || 0) / max))));
      if (el instanceof HTMLElement && desk.changed('vu:' + name, angle)) el.style.transform = 'rotate(' + angle + 'deg)';
    }
    const slider = desk.parts.get('slider') as HTMLInputElement | undefined;
    if (slider && slider.value !== String(tick)) slider.value = String(tick);
    const field = desk.parts.get('goTick') as HTMLInputElement | undefined;
    if (field && document.activeElement !== field && field.value !== String(tick)) field.value = String(tick);
    const line = desk.parts.get('sparkAt');
    if (line && desk.changed('spark', String(tick))) {
      line.setAttribute('x1', String(tick));
      line.setAttribute('x2', String(tick));
    }
    const lamps = [s.playing, !!view.live && view.live.state === 'live', !!s.cur || !!view.live, Number(d['denied'] || 0) > 0, view.promote === '409' || view.promote === '503', view.promote === '200'];
    lamps.forEach((on, i) => {
      const el = desk.parts.get('lamp' + i);
      if (el && desk.changed('lamp' + i, on ? '1' : '0')) el.classList.toggle('on', on);
    });

    const mapCv = desk.parts.get('map') as HTMLCanvasElement | undefined;
    const ms = desk.sizes.get('map');
    if (mapCv && ms) {
      const own = s.m?.diary && s.nick === s.cur?.summary.belief?.nick && view.mode !== 'truth' ? s.m.diary.at(tick).own : null;
      const state: MapState = { needles: s.m?.needles ?? [], land: view.pack ? s.lands[s.slotNo(view.pack, view.match)] ?? null : null, truth: shownTruth.current, belief: own, mode: view.mode, cell: view.cell, ghost: d['ghost-cell'] ?? '', zoom: Math.max(1, s.zoom) };
      const sig = [state.needles, state.land, state.truth, state.belief, state.mode, state.cell, state.ghost, state.zoom, ms.w];
      if (sig.some((x, i) => x !== mapSeen.current[i])) {
        mapSeen.current = sig;
        painters.map.draw(mapCv, ms.w, state);
      }
    }

    if (view.live) {
      const h = host.current;
      requestAnimationFrame(() => h?.ready(tick));
    }
  };
  const paintRef = useRef(paint);
  paintRef.current = paint;
  desk.onResize = () => paintRef.current();

  const setTick = (n: number): void => {
    const end = st.current.m?.ticks ?? 1200;
    const t = Math.max(0, Math.min(end, n));
    if (t === tickRef.current) return;
    tickRef.current = t;
    paintRef.current();
  };

  const setTickRef = useRef(setTick);
  setTickRef.current = setTick;
  const toggleRef = useRef(() => {});

  useLayoutEffect(() => paint());

  useEffect(() => {
    const t = new TruthClient();
    truth.current = t;
    t.onAnswer = (a) => {
      answer.current = a;
      paintRef.current();
    };
    t.onLive = (tick, score, scene) => {
      if (scene) answer.current = { key: 'live:' + tick, at: scene };
      tickRef.current = tick;
      liveRef.current = { ...liveRef.current, score };
      paintRef.current();
    };
    t.onLand = (slot, land) => setLands((x) => ({ ...x, [slot]: land }));
    const toBytes = (x: unknown): Uint8Array => (x instanceof Uint8Array ? x : x instanceof ArrayBuffer ? new Uint8Array(x) : new Uint8Array(x as number[]));
    const startLive = (h: Host): void => {
      const L = h.live();
      if (!L) return;
      t.send({ kind: 'live-start', manifest: toBytes(L.manifest), bots: L.bots, roster: L.roster, ticks: L.ticks, seat: L.seat });
      tickRef.current = 0;
      liveRef.current = { cap: 0, state: 'live', shares: null, score: null };
      setView((v) => ({ ...v, pack: null, tick: 0, focus: L.roster[L.seat] ?? '', live: liveRef.current }));
      liveOn.current = true;
    };
    void connect('Оперативна').then((h) => {
      host.current = h;
      h.on('live', () => startLive(h));
      h.on('tick', (msg) => {
        if (!liveOn.current) return;
        const submits = ((msg['submits'] as [string, unknown][]) ?? []).map(([slot, frame]) => [slot, toBytes(frame)] as [string, Uint8Array]);
        const denies = (msg['denies'] as [string, number, number][]) ?? [];
        t.send({ kind: 'live-tick', t: Number(msg['t']), submits, denies });
        liveRef.current = { ...liveRef.current, cap: Number(msg['cap'] ?? msg['t']) };
        paintRef.current();
      });
      h.on('end', (msg) => {
        const shares = (msg['shares'] as number[]) ?? [];
        t.send({ kind: 'live-end', shares });
        liveRef.current = { ...liveRef.current, state: 'end', shares, cap: Number(msg['t'] ?? liveRef.current.cap) };
        setView((v) => (v.live ? { ...v, live: liveRef.current } : v));
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
    cur.matches.forEach((mm, i) => {
      const k = view.pack + ':' + (i + 1);
      if (opened.current.has(k)) return;
      opened.current.add(k);
      t.open(slotNo(view.pack ?? '', i + 1), mm.bytes);
    });
  }, [cur, view.pack]);

  useEffect(() => {
    if (!playing || !cur) return;
    let id = 0;
    let last = performance.now();
    let carry = 0;
    const step = (now: number): void => {
      carry += ((now - last) * PLAY_RATE) / 1000;
      last = now;
      const n = Math.floor(carry);
      carry -= n;
      if (n > 0) {
        const end = st.current.m?.ticks ?? 1200;
        if (tickRef.current >= end) {
          setPlaying(false);
          return;
        }
        setTick(tickRef.current + n);
      }
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [playing, cur]);

  useEffect(() => sound.spin(playing && !!cur), [playing, cur]);

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
      if (e.key === 'Escape') {
        setCam(null);
        if (typing) el.blur();
        return;
      }
      if (typing && el.tagName === 'INPUT') sound.key();
      if (e.code === 'KeyM' && !typing) sound.toggleMute();
      if (e.code === 'Space' && !typing && !viewRef.current.live) {
        e.preventDefault();
        toggleRef.current();
      }
    };
    const wake = (): void => sound.unlock();
    window.addEventListener('keydown', wake, true);
    window.addEventListener('pointerdown', wake, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', wake, true);
      window.removeEventListener('pointerdown', wake, true);
      window.removeEventListener('keydown', key);
    };
  }, []);

  useEffect(() => {
    if (zoom <= 1) return;
    const again = (): void => zoomIn();
    window.addEventListener('resize', again);
    return () => window.removeEventListener('resize', again);
  }, [zoom > 1]);

  const sparkSlot = cur ? slotOf(view, cur) : '';
  const spark = useMemo(() => (m && cur ? channelOf(m, sparkSlot).series.map((p) => p.t + ',' + (40 - Math.min(40, p.bytes / 8))).join(' ') : ''), [cur, m, sparkSlot]);

  useEffect(() => {
    if (readySent.current || !cur) return;
    readySent.current = true;
    requestAnimationFrame(() => host.current?.ready(tickRef.current));
  }, [cur]);

  const zoomIn = (): void => {
    const el = roomRef.current;
    if (!el) return;
    const r0 = DEVICES.round;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const z = Math.min(window.innerWidth / ((w * r0.w) / 100), window.innerHeight / ((h * r0.h) / 100)) * 0.92;
    const cx = el.offsetLeft + (w * (r0.x + r0.w / 2)) / 100;
    const cy = el.offsetTop + (h * (r0.y + r0.h / 2)) / 100;
    setCam({ zoom: z, style: { transformOrigin: r0.x + r0.w / 2 + '% ' + (r0.y + r0.h / 2) + '%', transform: 'translate(' + (window.innerWidth / 2 - cx) + 'px, ' + (window.innerHeight / 2 - cy) + 'px) scale(' + z + ')' } });
  };

  const goTick = (s: string): void => {
    const from = tickRef.current;
    if (s === '+1') setTick(from + 1);
    else {
      const n = Number(s.trim());
      if (Number.isInteger(n)) setTick(n);
    }
    sound.seek(from, tickRef.current);
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
    set({ promote: '…' });
    sound.lever();
    const said = (status: string): void => {
      set({ promote: status });
      sound.answer(status);
    };
    void h.promote(preset).then(
      (r) => said(String(r.status)),
      () => said('err'),
    );
  };

  const acts = useRef({ set, goMatch, goTick, promote, setPreset });
  acts.current = { set, goMatch, goTick, promote, setPreset };
  const act = useMemo<Act>(() => ({ set: (p) => acts.current.set(p), goMatch: (x) => acts.current.goMatch(x), goTick: (x) => acts.current.goTick(x), promote: () => acts.current.promote(), setPreset: (x) => acts.current.setPreset(x), sfx: sound }), []);
  const toggle = useMemo(
    () => () => {
      if (!st.current.playing && tickRef.current >= (st.current.m?.ticks ?? 1200)) setTickRef.current(0);
      sound.button();
      setPlaying(!st.current.playing);
    },
    [],
  );
  toggleRef.current = toggle;
  const reg = desk.reg;

  return (
    <div className="stage">
      <div ref={roomRef} className={'room' + (playing ? ' playing' : '') + (zoom > 1 ? ' zoomed' : '')} style={cam?.style}>
        <img className="photo" src={room} alt="" draggable={false} />
        <Board canvas={desk.part('board', true)} reg={reg} />
        <Dev at="onAir" className={view.live ? 'lit' : ''}>
          <span className="sign">{view.live ? (view.live.state === 'end' ? 'КІНЕЦЬ' : 'ЕФІР') : 'ЗАПИС'}</span>
          <A name="live-state" reg={reg} />
          <A name="live-lag" label="відстав." reg={reg} />
          <button className={'mute' + (muted ? ' off' : '')} title="звук: клавіша M" onClick={(e) => { sound.toggleMute(); e.currentTarget.blur(); }}>{muted ? '♪ вимк.' : '♪ увімк.'}</button>
        </Dev>
        {METERS.map(([name], i) => (
          <Dev key={name} at={('vu' + (i + 1)) as Device}>
            <div className="needle" ref={desk.part('vu-' + name)} />
            <A name={name} label={['байти', 'команди', 'відмови'][i]} reg={reg} />
          </Dev>
        ))}
        <Dev at="left" className="mon">
          <span className="title">РОЗВІДКА</span>
          <A name="mode" label="шар" reg={reg} />
          <A name="cell" label="сота" reg={reg} />
          <A name="cell-owner-truth" label="правда" reg={reg} />
          <A name="cell-owner-belief" label="віра" reg={reg} />
          <A name="ghost-cell" label={'примара ' + (view.unit || '')} reg={reg} />
          <A name="ghost-age" label="вік" reg={reg} />
          <A name="diff-count" label="розбіжність" reg={reg} />
          <A name="dark-count" label="мовчать" reg={reg} />
        </Dev>
        <Dev at="round" className="screen">
          <div className="scope" onClick={() => zoom <= 1 && zoomIn()}>
            <MapScreen canvas={desk.part('map', true)} zoom={Math.max(1, zoom)} onPick={(c) => set({ cell: c })} />
            <div className="sweep" />
            <Names roster={roster} />
            <div className="glass" />
          </div>
          {zoom > 1 ? <button className="back" onClick={() => setCam(null)}>Esc</button> : null}
        </Dev>
        <Dev at="right" className="mon">
          <span className="title">КАНАЛ</span>
          <svg className="spark" viewBox="0 0 1200 40" preserveAspectRatio="none">
            <polyline fill="none" stroke="currentColor" strokeWidth="6" points={spark} />
            <line ref={desk.part('sparkAt')} x1={0} x2={0} y1="0" y2="40" stroke="#ffffff" strokeWidth="4" />
          </svg>
          <A name="deny-word" label={'відмова #' + view.order} reg={reg} />
          <A name="deny-top-tick" label="найгірший такт" reg={reg} />
        </Dev>
        <Note />
        <Reels />
        <Deck playing={playing} ticks={m?.ticks ?? 1200} toggle={toggle} act={act} part={desk.part} />
        <Tubes name="needles" g={TUBES.needles} reg={reg} />
        <Tubes name="shares" g={TUBES.shares} reg={reg} />
        <Spot b={ENGRAVE.needles} className="engr">ГОЛКИ</Spot>
        <Spot b={ENGRAVE.shares} className="engr">ЧАСТКИ</Spot>
        {LAMPS.map((b, i) => (
          <Spot key={i} b={b} className={'lamp l' + i} at={desk.part('lamp' + i)} />
        ))}
        <Dev at="keypad" className="keys">
          <input data-zaria="go-tick" title="такт: число і Enter" ref={desk.part('goTick')} defaultValue="0" placeholder="такт" onChange={(e) => goTick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && goTick(e.currentTarget.value)} />
          <Field name="go-cell" value={view.cell} placeholder="сота q,r" commit={goCell} />
          <Field name="go-unit" value={view.unit} placeholder="машина" commit={(s) => set({ unit: s.trim() })} />
          <Field name="go-order" value={String(view.order)} placeholder="команда" commit={goOrder} />
        </Dev>
        <Knobs match={view.match} mode={view.mode} nick={nick} roster={roster} live={!!view.live} act={act} />
        <Dev at="cassettes">
          <A name="ab-winner" label="краще" reg={reg} />
          <A name="ab-diff" label="різниця" reg={reg} />
          <A name="ab-top" label="стаття" reg={reg} />
        </Dev>
        <Drawer packs={packs} pack={view.pack} act={act} />
        <Lever preset={preset} status={view.promote} act={act} reg={reg} />
      </div>
    </div>
  );
}
