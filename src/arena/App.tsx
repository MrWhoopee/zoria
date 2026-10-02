import { useState } from 'react';
import { menuItems } from './menu.ts';
import type { MenuItem } from './menu.ts';
import { useArena } from './useArena.ts';
import type { MapPick } from './view/MapCanvas.tsx';
import { MapCanvas } from './view/MapCanvas.tsx';
import { Menu } from './view/Menu.tsx';
import { Panel } from './view/Panel.tsx';
import { SLOT_COLOR } from './view/palette.ts';
import { TopBar } from './view/TopBar.tsx';

interface Open {
  x: number;
  y: number;
  title: string;
  items: MenuItem[];
}

export function App() {
  const arena = useArena();
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<Open | null>(null);
  const [revealed, setRevealed] = useState(false);
  const { map, frame } = arena;
  const accent = map ? SLOT_COLOR[map.slot] ?? '#3fb8af' : '#3fb8af';

  const select = (p: MapPick): void => {
    const u = frame?.units.find((x) => x.q === p.q && x.r === p.r);
    setSelected(u ? u.id : null);
  };

  const open = (p: MapPick): void => {
    if (!map || !frame || frame.done) return;
    const unit = frame.units.find((x) => x.id === selected) ?? null;
    const items = menuItems(frame, map, { q: p.q, r: p.r }, unit);
    setMenu({ x: p.x, y: p.y, title: (unit ? unit.id + ' → ' : 'Наказ боту, ') + p.q + ',' + p.r, items });
  };

  const reveal = (): void => {
    if (!revealed && !arena.reveal) arena.askReveal();
    setRevealed(!revealed);
  };

  return (
    <div className="arena" style={{ ['--accent' as string]: accent }}>
      <TopBar
        arena={{
          ...arena,
          start: (o) => {
            setSelected(null);
            setRevealed(false);
            arena.start(o);
          },
        }}
      />
      {arena.error ? <div className="error">Бій не запустився: {arena.error}</div> : null}
      <main>
        {map ? (
          <MapCanvas map={map} frame={frame} reveal={revealed ? arena.reveal : null} selected={selected} onSelect={select} onMenu={open} />
        ) : (
          <div className="map empty">
            <p>Обери жереб, свій слот і двох суперників, потім натисни «Почати бій».</p>
          </div>
        )}
        <Panel slot={map?.slot ?? 'A'} frame={frame} selected={selected} revealed={revealed} saved={arena.saved} onSelect={setSelected} onCommand={arena.command} onReveal={reveal} />
      </main>
      {menu ? (
        <Menu
          {...menu}
          onPick={(m) => {
            arena.command(m.command);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}
