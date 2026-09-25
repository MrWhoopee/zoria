import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { notebookPages, PAGE_COLS, PAGE_ROWS, type Page } from '../notebook/pages.ts';
import type { Block, Inline } from '../text/markdown.ts';
import { notebookShown, type SceneState } from '../scene/machine.ts';
import { NOTEBOOK } from '../scene/geometry.ts';
import { whenLocal } from '../terminal/status.ts';
import { describeFailure } from '../terminal/errors.ts';
import { ackStage } from '../agent/actions.ts';
import { useStageTexts } from './useStageTexts.ts';
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

const TURN_MS = 450;
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

  if (acknowledgedAt) return <div className="nb-stamp done">RECEIVED {whenLocal(acknowledgedAt, zone)}</div>;
  const press = (): void => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState({ busy: true, error: null });
    ackStage(stageId, c.signal)
      .then((o) => { if (!c.signal.aborted) setState({ busy: false, error: o.ok ? null : describeFailure(o).join('  ') }); })
      .catch((err: unknown) => { if (!c.signal.aborted) setState({ busy: false, error: err instanceof Error ? err.message : 'FAILED' }); });
  };
  return (
    <div className="nb-stamp">
      <button type="button" data-zaria={A.notebookAck} disabled={state.busy} onClick={press}>
        {state.busy ? 'STAMPING...' : 'ACKNOWLEDGE RECEIPT'}
      </button>
      {state.error && <span className="nb-stamp-error">{state.error}</span>}
    </div>
  );
}

function PageView({ page, zone, onJump }: { page: Page | undefined; zone: string; onJump: (page: number) => void }) {
  let content: ReactNode = null;
  if (page?.kind === 'contents') {
    content = (
      <>
        <h2 className="nb-title">PARTS OF THE TASK</h2>
        {page.entries.length === 0 && <p className="nb-p">Nothing released yet. Parts arrive through the API only.</p>}
        <ol className="nb-contents">
          {page.entries.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => { if (e.page !== null) onJump(e.page); }}>
                {e.position}. {e.title}
              </button>
              <span className="nb-meta">
                given {whenLocal(e.releasedAt, zone)} · {e.acknowledgedAt ? 'received' : 'NEW'}
                {e.errataAt ? ` · errata ${whenLocal(e.errataAt, zone)}` : ''}
              </span>
            </li>
          ))}
        </ol>
      </>
    );
  } else if (page?.kind === 'waiting') {
    content = <><h2 className="nb-title">{page.position}. {page.title}</h2><p className="nb-p">The text is on its way…</p></>;
  } else if (page?.kind === 'stage') {
    content = (
      <>
        {page.first && (
          <>
            <h2 className="nb-title">{page.position}. {page.title}</h2>
            <Stamp stageId={page.stageId} acknowledgedAt={page.acknowledgedAt} zone={zone} />
            {page.errata && (
              <aside className="nb-errata" data-zaria={A.notebookErrata}>
                <strong>ERRATA</strong> {page.errata}
              </aside>
            )}
          </>
        )}
        {page.blocks.map((b, i) => <BlockView key={i} block={b} />)}
      </>
    );
  }
  return <section className="nb-page" data-zaria={A.notebookPage}>{content}</section>;
}

export function Notebook({ scene, stages, zone, reducedMotion, onClose, onTurn }: Props) {
  const shown = notebookShown(scene);
  const texts = useStageTexts(stages, shown);
  const pages = useMemo(() => notebookPages(stages, texts), [stages, texts]);
  const spreads = pages.length / 2;
  const [spread, setSpread] = useState(0);
  const [turn, setTurn] = useState<'next' | 'prev' | null>(null);
  const current = Math.min(spread, spreads - 1);

  useEffect(() => {
    if (turn === null) return;
    const t = setTimeout(() => setTurn(null), TURN_MS);
    return () => clearTimeout(t);
  }, [turn]);

  const go = (to: number): void => {
    const target = Math.max(0, Math.min(spreads - 1, to));
    if (target === current) return;
    setSpread(target);
    if (!reducedMotion) setTurn(target > current ? 'next' : 'prev');
    onTurn();
  };
  const goRef = useRef(go);
  useEffect(() => { goRef.current = go; });

  useEffect(() => {
    if (scene !== 'notebook') return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goRef.current(current + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goRef.current(current - 1); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [scene, current, onClose]);

  if (!shown) return null;

  const cx = NOTEBOOK.left + NOTEBOOK.width / 2 - 0.5;
  const cy = NOTEBOOK.top + NOTEBOOK.height / 2 - 0.5;
  const style = {
    '--fx': `${cx * 100}cqw`,
    '--fy': `${cy * 100 * ASPECT}cqw`,
    '--cols': PAGE_COLS,
    '--rows': PAGE_ROWS,
  } as CSSProperties;

  return (
    <div className={`notebook ${scene}`} data-zaria={A.notebook} style={style} onClick={onClose}>
      <div className="nb-book" onClick={(e) => e.stopPropagation()}>
        <PageView page={pages[current * 2]} zone={zone} onJump={(p) => go(Math.floor(p / 2))} />
        <PageView page={pages[current * 2 + 1]} zone={zone} onJump={(p) => go(Math.floor(p / 2))} />
        {turn && <div className={`nb-leaf ${turn}`} />}
        <button type="button" className="nb-edge prev" data-zaria={A.notebookPrev} aria-label="Previous pages" disabled={current === 0} onClick={() => go(current - 1)} />
        <button type="button" className="nb-edge next" data-zaria={A.notebookNext} aria-label="Next pages" disabled={current >= spreads - 1} onClick={() => go(current + 1)} />
        <div className="nb-folio">{current * 2 + 1}–{current * 2 + 2} / {pages.length}</div>
      </div>
    </div>
  );
}
