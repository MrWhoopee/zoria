import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const KIT = join(ROOT, 'node_modules', '@zoria', 'kit', 'src', 'hq');
const kit = (f) => import(pathToFileURL(join(KIT, f)).href);

const { SHOW_CSP, startServer } = await kit('serve.mjs');
const { openRecord } = await kit('record.mjs');

const records = join(ROOT, 'records');
const dist = join(ROOT, 'hq', 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('no hq/dist/index.html: run npm run build in hq first');
  process.exit(1);
}

const all = [
  { id: 'reference', title: 'еталон (рівний)', preset: 'рівний' },
  { id: 'preset-a', title: 'пресет A (рівний)', preset: 'рівний' },
  { id: 'preset-b', title: 'пресет B (обхідник)', preset: 'обхідник' },
]
  .map((p) => ({ ...p, dir: join(records, p.id) }))
  .filter((p) => existsSync(join(p.dir, 'pack.json')))
  .map((p) => ({ ...p, rec: openRecord(p.dir) }));

const oursDirs = readdirSync(records).filter((d) => d.startsWith('ours')).sort();
for (const group of oursDirs) {
  const oursDir = join(records, group);
  const packsIn = readdirSync(oursDir).filter((d) => existsSync(join(oursDir, d, 'pack.json'))).sort();
  for (const d of packsIn) {
    const dir = join(oursDir, d);
    const rec = openRecord(dir);
    const pack = rec.pack;
    if (!pack.belief) pack.belief = { seat: 0, nick: pack.roster?.[0] ?? '', files: [1, 2, 3].map((n) => 'belief-' + n + '.ndjson') };
    const seed = d.split('-')[1] ?? d;
    const rivals = (pack.roster ?? []).slice(1).join('+');
    all.push({ id: 'ours-' + (all.length - 2), title: group + ': ' + rivals + ' · ' + seed, preset: 'глушій', dir, rec });
  }
}

const config = () =>
  JSON.stringify({
    lang: 'uk',
    mode: 'record',
    hq: '/hq/index.html',
    files: '/records/',
    packs: all.map((p) => ({ id: p.id, title: p.title, preset: p.preset, pack: p.rec.pack })),
    promote: { answers: [{ status: 200 }] },
    live: { tempoMs: 25, feed: [] },
  });

const srv = await startServer({
  mounts: [
    { prefix: '/host', root: resolve(KIT, '..', '..', 'hq'), index: 'host.html' },
    { prefix: '/hq', root: dist, csp: SHOW_CSP },
    ...all.map((p) => ({ prefix: '/records/' + p.id, root: p.dir })),
  ],
  dynamic: { '/host/config.json': config },
});

console.log('штаб: ' + srv.origin + '/host/');
console.log('Ctrl+C to stop');
