import { useState } from 'react';
import type { SlotName } from '@zoria/protocol';
import { SPEEDS } from '../loop.ts';
import type { Arena } from '../useArena.ts';

const SLOTS: SlotName[] = ['A', 'B', 'C'];

function Pick({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="pick">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TopBar({ arena }: { arena: Arena }) {
  const [seed, setSeed] = useState(100);
  const [slot, setSlot] = useState<SlotName>('A');
  const [rivalA, setRivalA] = useState('глушій');
  const [rivalB, setRivalB] = useState('загарбник');
  const [preset, setPreset] = useState('глушій-3');
  const names = arena.names.length > 0 ? arena.names : ['глушій'];
  const started = arena.map !== null;
  const done = arena.frame?.done ?? false;
  return (
    <header className="topbar">
      <div className="setup">
        <label className="pick">
          <span>Жереб</span>
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} />
        </label>
        <Pick label="Твій слот" value={slot} options={SLOTS} onChange={(v) => setSlot(v as SlotName)} />
        <Pick label="Твій бот" value={preset} options={names} onChange={setPreset} />
        <Pick label="Суперник 1" value={rivalA} options={names} onChange={setRivalA} />
        <Pick label="Суперник 2" value={rivalB} options={names} onChange={setRivalB} />
        <button className="primary" onClick={() => arena.start({ seed, slot, rivals: [rivalA, rivalB], preset })}>
          {started ? 'Новий бій' : 'Почати бій'}
        </button>
      </div>
      <div className="clock">
        <button disabled={!started || done} onClick={() => (arena.running ? arena.pause() : arena.resume())}>
          {arena.running ? 'Пауза' : 'Далі'}
        </button>
        <button disabled={!started || done || arena.running} onClick={arena.step}>
          Крок
        </button>
        <select value={arena.speed} onChange={(e) => arena.setSpeed(Number(e.target.value))} aria-label="Швидкість">
          {SPEEDS.map((x) => (
            <option key={x} value={x}>
              {x}×
            </option>
          ))}
        </select>
        <span className="tick">
          {arena.frame?.t ?? 0}
          <small> / 1200</small>
        </span>
      </div>
    </header>
  );
}
