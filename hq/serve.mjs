/* штаб :: сервер показу
   віддає зібраний каталог показу і більше нічого. Залежностей немає
   навмисно: сервер статики - це сорок рядків, а зайвий пакет в образі -
   зайвий спосіб не зібратися в день здачі.

   CSP рахується за самою сторінкою при старті: хеші вбудованих блоків
   script і style плюс connect-src 'none'. Так заголовок дозволяє рівно
   цей бандл і нічого крім - показ, який поліз у мережу за шрифтом або
   даними, зламається у вас, а не на трансляції (частина 3, контракт штабу).

   Приймання і трансляція відкривають показ у рамці з опаковим джерелом,
   де зовнішній файл не завантажиться в принципі; тому index.html
   зобов'язаний бути самодостатнім. Сервер цього не лагодить - він
   лише не заважає. */

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(process.env.HQ_ROOT || 'show');
const PORT = Number(process.env.HQ_PORT || 8080);
const HOST = process.env.HQ_HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/* хеші вбудованих блоків сторінки: саме вони й потрапляють до CSP */
function hashes(html, tag) {
  const out = new Set();
  for (const m of html.matchAll(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>', 'gi'))) {
    out.add("'sha256-" + createHash('sha256').update(m[1], 'utf8').digest('base64') + "'");
  }
  return [...out];
}

function policy(html) {
  const script = ["'unsafe-eval'", ...hashes(html, 'script')];
  const style = hashes(html, 'style');
  return [
    "default-src 'none'",
    'script-src ' + script.join(' '),
    'style-src ' + (style.length ? style.join(' ') : "'none'"),
    'font-src data:',
    'img-src data: blob:',
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const index = join(ROOT, 'index.html');
const csp = policy(readFileSync(index, 'utf8'));
const files = readdirSync(ROOT, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile())
  .length;

const server = createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/livez') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end('{"status":"ok"}');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  /* лише всередину каталогу показу: '..' у адресі не виводить з нього */
  const rel = normalize(decodeURIComponent(url)).replace(/^(\.\.[/\\])+/, '');
  const path = url === '/' || url.endsWith('/') ? join(ROOT, rel, 'index.html') : join(ROOT, rel);
  if (!path.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  let body;
  try {
    if (!statSync(path).isFile()) throw new Error('not a file');
    body = readFileSync(path);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404');
    return;
  }
  const head = {
    'content-type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream',
    'content-length': body.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
  if (path === index) head['content-security-policy'] = csp;
  res.writeHead(200, head);
  res.end(req.method === 'HEAD' ? undefined : body);
});

server.listen(PORT, HOST, () => {
  process.stdout.write('[hq] ' + HOST + ':' + PORT + ', файлів ' + files + '\n');
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.once(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  });
}
