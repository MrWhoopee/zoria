import { useEffect, useState } from 'react';
import { acceptsInput, crtPhase, type SceneState } from '../scene/machine.ts';
import { SCREEN } from '../scene/geometry.ts';
import { composeScreen, splitAtColumn } from '../terminal/grid.ts';
import { helpLines, parseCommand } from '../terminal/commands.ts';
import { formatLocal, statusLines } from '../terminal/status.ts';
import type { Snapshot } from '../agent/snapshot.ts';
import { A } from '../anchors.ts';

type Props = { scene: SceneState; snapshot: Snapshot | null; onShutdown: () => void };

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const BOOT = ['ZORIA.NET TERMINAL', '', 'LINK ........ OK', 'ETHER ....... LISTENING'];
const HINT = 'type HELP';
const pct = (n: number): string => `${n * 100}%`;

export function Terminal({ scene, snapshot, onShutdown }: Props) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState<string[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const crt = crtPhase(scene);
  const live = acceptsInput(scene);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (crt === 'off') {
      setInput('');
      setOutput(null);
    }
  }, [crt]);

  useEffect(() => {
    if (!live) return;
    const run = (raw: string): void => {
      const cmd = parseCommand(raw);
      const echo = `> ${raw}`;
      if (cmd.kind === 'empty' || cmd.kind === 'status') setOutput(null);
      else if (cmd.kind === 'help') setOutput([echo, ...helpLines()]);
      else if (cmd.kind === 'shutdown') onShutdown();
      else setOutput([echo, `UNKNOWN COMMAND: ${cmd.word.toUpperCase()}`]);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        run(input);
        setInput('');
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setInput(input.slice(0, -1));
      } else if (e.key.length === 1) {
        if (e.key === ' ') e.preventDefault();
        setInput((input + e.key.toUpperCase()).slice(-200));
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [live, input, onShutdown]);

  const booting = crt === 'booting';
  const screen = composeScreen({
    header: booting ? [] : [`ZORIA.NET  ${formatLocal(now, ZONE)} ${ZONE}`, ''],
    body: booting ? BOOT : output ?? statusLines(snapshot, now, ZONE),
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
