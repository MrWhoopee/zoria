import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { notebookPages, PAGE_COLS, PAGE_ROWS, type Page } from '../notebook/pages.ts';
import type { Block, Inline } from '../text/markdown.ts';
import { notebookShown, type SceneState } from '../scene/machine.ts';
import { NOTEBOOK } from '../scene/geometry.ts';
import { whenLocal } from '../terminal/status.ts';
import { describeFailure } from '../terminal/errors.ts';
import { ackStage } from '../agent/actions.ts';
import { useStageTexts } from './useStageTexts.ts';
import { useTurn } from './useTurn.ts';
import { CurlLayers, Corner } from './PageCurl.tsx';
import type { Side } from '../notebook/curl.ts';
import type { StageSummary } from '../../agent/account.ts';
import { A } from '../anchors.ts';

type Props = {
  scene: SceneState;
  stages: StageSummary[];
  zone: string;
  reducedMotion: boolean;
  onClose: () => void;
  onTurn: () => void;
};

const ASPECT = 572 / 1024;

function InlineView({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((x, i) => {
        if (x.t === 'bold') return <strong key={i}>{x.s}</strong>;
        if (x.t === 'code') return <code key={i}>{x.s}</code>;
        if (x.t === 'link') {
          return x.href
            ? <a key={i} href={x.href} target="_blank" rel="noopener noreferrer">{x.s}</a>
            : <span key={i}>{x.s}</span>;
        }
        return <span key={i}>{x.s}</span>;
      })}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.t === 'heading') return <h3 className={`nb-h nb-h${block.level}`}><InlineView items={block.inline} /></h3>;
  if (block.t === 'para') return <p className="nb-p"><InlineView items={block.inline} /></p>;
  if (block.t === 'list') {
    const items = block.items.map((item, i) => <li key={i}><InlineView items={item} /></li>);
    return block.ordered ? <ol className="nb-list">{items}</ol> : <ul className="nb-list">{items}</ul>;
  }
  return <pre className="nb-code">{block.lines.join('\n')}</pre>;
}

function Stamp({ stageId, acknowledgedAt, zone }: { stageId: string; acknowledgedAt: string | null; zone: string }) {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => () => ctrl.current?.abort(), []);

  if (acknowledgedAt) return <div className="nb-stamp done">ОТРИМАНО {whenLocal(acknowledgedAt, zone)}</div>;
  const press = (): void => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState({ busy: true, error: null });
    ackStage(stageId, c.signal)
      .then((o) => { if (!c.signal.aborted) setState({ busy: false, error: o.ok ? null : describeFailure(o).join('  ') }); })
      .catch((err: unknown) => { if (!c.signal.aborted) setState({ busy: false, error: err instanceof Error ? err.message : 'НЕ ВДАЛОСЯ' }); });
  };
  return (
    <div className="nb-stamp">
      <button type="button" data-zaria={A.notebookAck} disabled={state.busy} onClick={press}>
        {state.busy ? 'СТАВЛЮ ПЕЧАТКУ…' : 'ПІДТВЕРДИТИ ОТРИМАННЯ'}
      </button>
      {state.error && <span className="nb-stamp-error">{state.error}</span>}
    </div>
  );
}

function PageView({ page, zone, side, hidden = false, onJump }: {
  page: Page | undefined; zone: string; side: 'left' | 'right'; hidden?: boolean; onJump: (page: number) => void;
}) {
  let content: ReactNode = null;
  if (page?.kind === 'contents') {
    content = (
      <>
        <h2 className="nb-title">ЗАВДАННЯ ВІД СТАНЦІЇ</h2>
        {page.entries.length === 0 && <p className="nb-p">Ефір поки мовчить. Частини завдання приходять лише зі станції.</p>}
        <ol className="nb-contents">
          {page.entries.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => { if (e.page !== null) onJump(e.page); }}>
                {e.position}. {e.title}
              </button>
              <span className="nb-meta">
                прийнято {whenLocal(e.releasedAt, zone)} · {e.acknowledgedAt ? 'отримання підтверджено' : 'нове'}
                {e.errataAt ? ` · уточнення ${whenLocal(e.errataAt, zone)}` : ''}
              </span>
            </li>
          ))}
        </ol>
      </>
    );
  } else if (page?.kind === 'waiting') {
    content = <><h2 className="nb-title">{page.position}. {page.title}</h2><p className="nb-p">Текст ще йде ефіром…</p></>;
  } else if (page?.kind === 'stage') {
    content = (
      <>
        {page.first && (
          <>
            <h2 className="nb-title">{page.position}. {page.title}</h2>
            <Stamp stageId={page.stageId} acknowledgedAt={page.acknowledgedAt} zone={zone} />
            {page.errata && (
              <aside className="nb-errata" data-zaria={A.notebookErrata}>
                <strong>УТОЧНЕННЯ</strong> {page.errata}
              </aside>
            )}
          </>
        )}
        {page.blocks.map((b, i) => <BlockView key={i} block={b} />)}
      </>
    );
  }
  return <section className={`nb-page ${side}${hidden ? ' turning' : ''}`} data-zaria={A.notebookPage}>{content}</section>;
}

export function Notebook({ scene, stages, zone, reducedMotion, onClose, onTurn }: Props) {
  const shown = notebookShown(scene);
  const texts = useStageTexts(stages, shown);
  const stagesKey = stages.map((x) => `${x.id}:${x.position}:${x.title}:${x.releasedAt ?? ''}:${x.acknowledgedAt ?? ''}:${x.errataAt ?? ''}`).join('|');
  const pages = useMemo(() => (shown ? notebookPages(stages, texts) : []), [stagesKey, texts, shown]);
  const spreads = Math.max(1, pages.length / 2);
  const [spread, setSpread] = useState(0);
  const current = Math.min(spread, spreads - 1);
  const book = useRef<HTMLDivElement | null>(null);

  const turn = useTurn((side, completed) => {
    if (!completed) return;
    onTurn();
    setSpread((s) => Math.max(0, Math.min(spreads - 1, s + (side === 'next' ? 1 : -1))));
  });

  const measure = () => {
    const el = book.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      size: { w: rect.width / 2, h: rect.height },
      toBook: (e: { clientX: number; clientY: number }) => ({ x: e.clientX - rect.left, y: e.clientY - rect.top }),
    };
  };

  const go = (side: Side): void => {
    const to = current + (side === 'next' ? 1 : -1);
    if (to < 0 || to > spreads - 1 || turn.busy) return;
    const m = measure();
    if (reducedMotion || !m) {
      onTurn();
      setSpread(to);
    } else turn.auto(side, m.size);
  };
  const goRef = useRef(go);
  useEffect(() => { goRef.current = go; });

  useEffect(() => {
    if (scene !== 'notebook') return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goRef.current('next'); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goRef.current('prev'); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [scene, onClose]);

  if (!shown) return null;

  const cx = NOTEBOOK.left + NOTEBOOK.width / 2 - 0.5;
  const cy = NOTEBOOK.top + NOTEBOOK.height / 2 - 0.5;
  const style = {
    '--fx': `${cx * 100}cqw`,
    '--fy': `${cy * 100 * ASPECT}cqw`,
    '--cols': PAGE_COLS,
    '--rows': PAGE_ROWS,
  } as CSSProperties;

  const jump = (p: number): void => { if (!turn.busy) setSpread(Math.floor(p / 2)); };
  const page = (i: number, side: 'left' | 'right') => <PageView page={pages[i]} zone={zone} side={side} onJump={jump} />;
  const turning = turn.frame.side;
  const ahead = turning === 'next' ? current + 1 : current - 1;
  const canNext = current < spreads - 1;
  const canPrev = current > 0;

  return (
    <div className={`notebook ${scene}`} data-zaria={A.notebook} style={style} onClick={onClose}>
      <div className="nb-book" ref={book} onClick={(e) => e.stopPropagation()}>
        <PageView page={pages[current * 2]} zone={zone} side="left" hidden={turning === 'prev'} onJump={jump} />
        <PageView page={pages[current * 2 + 1]} zone={zone} side="right" hidden={turning === 'next'} onJump={jump} />
        <CurlLayers
          frame={turn.frame}
          size={turn.size}
          turning={turning === 'next' ? page(current * 2 + 1, 'right') : page(current * 2, 'left')}
          under={turning === 'next' ? page(ahead * 2 + 1, 'right') : page(ahead * 2, 'left')}
          back={turning === 'next' ? page(ahead * 2, 'left') : page(ahead * 2 + 1, 'right')}
        />
        <button type="button" className="nb-edge prev" data-zaria={A.notebookPrev} aria-label="Попередні сторінки" disabled={!canPrev} onClick={() => go('prev')} />
        <button type="button" className="nb-edge next" data-zaria={A.notebookNext} aria-label="Наступні сторінки" disabled={!canNext} onClick={() => go('next')} />
        {(['prev', 'next'] as const).map((side) => (
          <Corner
            key={side}
            side={side}
            enabled={!reducedMotion && (side === 'next' ? canNext : canPrev)}
            dragging={turn.dragging}
            measure={measure}
            onPeek={turn.peek}
            onUnpeek={turn.unpeek}
            onGrab={turn.grab}
            onMove={turn.move}
            onDrop={turn.drop}
          />
        ))}
        <div className="nb-folio">{current * 2 + 1}–{current * 2 + 2} / {pages.length}</div>
      </div>
    </div>
  );
}
