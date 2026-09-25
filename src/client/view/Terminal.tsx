import { useEffect, useMemo, useRef, useState } from 'react';
import { acceptsInput, crtPhase, type SceneState } from '../scene/machine.ts';
import { SCREEN } from '../scene/geometry.ts';
import { COLS, composeScreen, splitAtColumn } from '../terminal/grid.ts';
import { helpLines, parseCommand, type Command } from '../terminal/commands.ts';
import { formatLocal, statusLines } from '../terminal/status.ts';
import { letterLines } from '../terminal/letter.ts';
import { openScroll, scrollBy, scrollKey, scrollTo, scrollView, type Scroll } from '../terminal/pager.ts';
import { mailList, mailText, newsList, newsText, numbered, partsList, repoLines, rollLines } from '../terminal/account.ts';
import { describeFailure } from '../terminal/errors.ts';
import { latest } from '../terminal/requests.ts';
import { ackStage, login, logout, markRead, roll } from '../agent/actions.ts';
import type { Outcome } from '../agent/outcome.ts';
import type { Snapshot } from '../agent/snapshot.ts';
import type { RollEntry } from '../../protocol/types.ts';
import { A } from '../anchors.ts';

type Props = { scene: SceneState; snapshot: Snapshot | null; onShutdown: () => void; onStepBack: () => void };

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const BOOT = ['ZORIA.NET TERMINAL', '', 'LINK ........ OK', 'ETHER ....... LISTENING'];
const HINT = 'type HELP';
const pct = (n: number): string => `${n * 100}%`;
const OFFLINE_LINES = ['AGENT OFFLINE', 'start the agent: npm run agent'];

export function Terminal({ scene, snapshot, onShutdown, onStepBack }: Props) {
  const [input, setInput] = useState('');
  const [view, setView] = useState<Scroll | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const tickets = useMemo(latest, []);
  const abort = useRef<AbortController | null>(null);
  const snapRef = useRef(snapshot);
  const crt = crtPhase(scene);
  const live = acceptsInput(scene);

  useEffect(() => { snapRef.current = snapshot; }, [snapshot]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    abort.current = ctrl;
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (crt === 'off') {
      tickets.next();
      setInput('');
      setView(null);
    }
  }, [crt, tickets]);

  useEffect(() => {
    if (!live) return;
    const signal = (): AbortSignal => abort.current?.signal ?? AbortSignal.abort();
    const show = (title: string, lines: string[]): void => setView(openScroll(title, lines));
    const later = (title: string, pending: Promise<Outcome>, done: (o: Outcome & { ok: true }) => string[]): void => {
      const ticket = tickets.next();
      show(title, ['...']);
      pending
        .then((o) => { if (tickets.isCurrent(ticket)) show(title, o.ok ? done(o) : describeFailure(o)); })
        .catch((err: unknown) => { if (tickets.isCurrent(ticket)) show(title, [err instanceof Error ? err.message : 'FAILED']); });
    };

    const run = (cmd: Command): void => {
      const snap = snapRef.current;
      const account = snap?.account ?? null;
      tickets.next();
      switch (cmd.kind) {
        case 'empty': case 'status': setView(null); return;
        case 'help': show('HELP', helpLines()); return;
        case 'shutdown': onShutdown(); return;
        case 'unknown': show('?', [`UNKNOWN COMMAND: ${cmd.word.toUpperCase()}`, 'type HELP']); return;
        case 'letter': show('LETTER', snap ? letterLines(snap.ether) : OFFLINE_LINES); return;
        case 'login': later('LOGIN', login(signal()), () => ['SIGNED IN']); return;
        case 'logout': later('LOGOUT', logout(signal()), () => ['SESSION ENDED', 'type LOGIN to sign in again']); return;
        case 'roll':
          later('ROLL', roll(signal()), (o) => rollLines((o.entries ?? []) as RollEntry[], account?.session.displayName ?? null, ZONE));
          return;
      }
      if (!account) { show(cmd.kind.toUpperCase(), OFFLINE_LINES); return; }
      switch (cmd.kind) {
        case 'parts': show('PARTS', partsList(account.stages, ZONE)); return;
        case 'repo': show('REPO', repoLines(account.repository, account.config, account.session.username, ZONE, COLS)); return;
        case 'ack': {
          const stage = account.stages.find((s) => s.position === cmd.n);
          if (!stage) { show('ACK', ['type ACK N with a part number from PARTS']); return; }
          later('ACK', ackStage(stage.id, signal()), () => [`PART ${stage.position} RECEIPT ACKNOWLEDGED`]);
          return;
        }
        case 'mail': {
          const list = numbered(account.inbox, (m) => m.createdAt);
          if (cmd.n === null) { show('MAIL', mailList(account.inbox, ZONE)); return; }
          const hit = list.find((x) => x.n === cmd.n);
          if (!hit) { show('MAIL', ['NO SUCH LETTER', 'type MAIL for the list']); return; }
          show(`MAIL ${hit.n}`, mailText(hit.item, ZONE, COLS));
          if (hit.item.readAt === null) {
            markRead(hit.item.id, signal())
              .then((o) => { if (!o.ok) console.warn('could not mark the letter read:', describeFailure(o).join(' ')); })
              .catch((err: unknown) => { console.warn('could not mark the letter read:', err); });
          }
          return;
        }
        case 'news': {
          const list = numbered(account.news, (x) => x.publishedAt);
          if (cmd.n === null) { show('NEWS', newsList(account.news, ZONE)); return; }
          const hit = list.find((x) => x.n === cmd.n);
          show(hit ? `NEWS ${hit.n}` : 'NEWS', hit ? newsText(hit.item, ZONE, COLS) : ['NO SUCH ITEM', 'type NEWS for the list']);
          return;
        }
      }
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (view) { tickets.next(); setView(null); } else onStepBack();
        return;
      }
      const step = scrollKey(e.key);
      if (step !== null) {
        if (!view) return;
        e.preventDefault();
        setView((v) => (v === null ? v : typeof step === 'number' ? scrollBy(v, step) : scrollTo(v, step)));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        run(parseCommand(input));
        setInput('');
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setInput(input.slice(0, -1));
      } else if (e.key.length === 1) {
        if (e.key === ' ') e.preventDefault();
        setInput((input + e.key.toUpperCase()).slice(-200));
      }
    };
    const onWheel = (e: WheelEvent): void => {
      if (e.deltaY === 0) return;
      setView((v) => (v === null ? v : scrollBy(v, Math.sign(e.deltaY) * 3)));
    };
    addEventListener('keydown', onKey);
    addEventListener('wheel', onWheel, { passive: true });
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('wheel', onWheel);
    };
  }, [live, input, view, onShutdown, onStepBack, tickets]);

  const booting = crt === 'booting';
  const body = booting ? BOOT : view === null ? statusLines(snapshot, now, ZONE) : scrollView(view);
  const screen = composeScreen({
    header: booting ? [] : [`ZORIA.NET  ${formatLocal(now, ZONE)} ${ZONE}`, ''],
    body,
    input: booting ? '' : input,
    hint: booting ? '' : HINT,
  });

  return (
    <div
      className="terminal"
      data-zaria={A.terminal}
      data-crt={crt}
      style={{ left: pct(SCREEN.left), top: pct(SCREEN.top), width: pct(SCREEN.width), height: pct(SCREEN.height) }}
    >
      <div className="glass" />
      <div className="screen">
        {screen.lines.map((line, i) => {
          const isInput = i === screen.cursor.row;
          return (
            <div key={i} className="line" data-zaria={isInput ? A.terminalInput : A.terminalLine}>
              {isInput && live
                ? (() => {
                    const [before, after] = splitAtColumn(line, screen.cursor.col);
                    return <>{before}<span className="cursor">█</span>{after}</>;
                  })()
                : line}
            </div>
          );
        })}
      </div>
      <div className="beam" />
    </div>
  );
}
