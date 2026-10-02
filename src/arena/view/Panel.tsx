import type { SlotName } from '@zoria/protocol';
import type { ArenaFrame } from '../../../bot/arena/frame.ts';
import type { GeneralCommand } from '../../../bot/src/general.ts';
import { SLOT_COLOR } from './palette.ts';

const SLOTS: SlotName[] = ['A', 'B', 'C'];
const TASK: Record<string, string> = { idle: 'стоїть', jam: 'глушить', ram: 'таранить', build: 'будує', home: 'додому', move: 'іде', work: 'працює' };
const GOAL: Record<string, string> = { jam: 'глушити', ram: 'таранити', build: 'будувати' };

export function Panel({ slot, frame, selected, revealed, onSelect, onCommand, onReveal }: { slot: SlotName; frame: ArenaFrame | null; selected: string | null; revealed: boolean; onSelect: (id: string | null) => void; onCommand: (c: GeneralCommand) => void; onReveal: () => void }) {
  if (!frame) return <aside className="panel"><p className="hint">Обери суперників і натисни «Почати бій». Бій стартує на паузі.</p></aside>;
  const places = [...frame.score].map((s, i) => ({ slot: SLOTS[i] ?? 'A', s })).sort((a, b) => b.s - a.s);
  return (
    <aside className="panel">
      <section>
        <h2>Рахунок</h2>
        <ol className="score">
          {places.map((p) => (
            <li key={p.slot} className={p.slot === slot ? 'me' : ''} style={{ borderColor: SLOT_COLOR[p.slot] }}>
              <span>{p.slot === slot ? 'Ти' : 'Слот ' + p.slot}</span>
              <b>{p.s.toFixed(1)}</b>
            </li>
          ))}
        </ol>
        <div className="meters">
          <span>Заряд <b>{Math.round(frame.energy)}</b>/360</span>
          <span>Канал <b>{Math.round(frame.chan)}</b>/{Math.round(frame.chanAt)}</span>
        </div>
        {frame.done ? (
          <div className="result">
            {frame.place === 1 ? 'Перемога: перше місце.' : 'Місце ' + frame.place + ' з 3.'}
            <button onClick={onReveal}>{revealed ? 'Сховати карту' : 'Показати всю карту'}</button>
          </div>
        ) : null}
      </section>
      <section>
        <h2>Твоя армія</h2>
        {frame.units.length === 0 ? <p className="hint">Машин ще немає.</p> : null}
        <ul className="units">
          {frame.units.map((u) => (
            <li key={u.id} className={u.id === selected ? 'sel' : ''} onClick={() => onSelect(u.id === selected ? null : u.id)}>
              <code>{u.id}</code>
              <span>{TASK[u.task] ?? u.task}</span>
              <button
                className={u.manual ? 'mine' : ''}
                onClick={(e) => {
                  e.stopPropagation();
                  onCommand(u.manual ? { kind: 'release', unit: u.id } : { kind: 'take', unit: u.id });
                }}
              >
                {u.manual ? 'моя' : 'бот'}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Накази боту</h2>
        {frame.goals.length === 0 ? <p className="hint">Правий клік по карті без вибраної машини.</p> : null}
        <ul className="goals">
          {frame.goals.map((g) => (
            <li key={g.id}>
              <span>{GOAL[g.kind] ?? g.kind} {g.cell ? g.cell.q + ',' + g.cell.r : g.target}</span>
              <code>{g.unit ?? 'шукаю машину'}</code>
              <button onClick={() => onCommand({ kind: 'cancel', id: g.id })}>Скасувати</button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Верф</h2>
        <div className="yard">
          {([['ткач', 'Ткач'], ['клинок', 'Клинок'], [null, 'Як вирішить бот']] as const).map(([cls, label]) => (
            <button key={label} className={frame.yardNext === cls ? 'on' : ''} onClick={() => onCommand({ kind: 'yard', cls })}>
              {label}
            </button>
          ))}
        </div>
      </section>
      <section className="feed">
        <h2>Що робить бот</h2>
        <ul>
          {frame.decisions.map((d, i) => (
            <li key={i}>
              <code>{d.tag}</code> {d.unit ?? ''}
            </li>
          ))}
        </ul>
        {frame.notes.length > 0 ? (
          <ul className="notes">
            {frame.notes.slice(-6).map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </aside>
  );
}
