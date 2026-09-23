import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

export function resolveClientPath(clientDir: string, urlPath: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  if (path.includes('\0') || path.includes('\\')) return null;
  if (path.split('/').some((segment) => segment.startsWith('.'))) return null;
  if (path === '/' || path === '') path = '/index.html';
  const root = resolve(clientDir);
  const full = resolve(root, `.${path}`);
  return full.startsWith(root + sep) ? full : null;
}

export function contentTypeFor(file: string): string {
  return TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

export async function readClientFile(clientDir: string, urlPath: string): Promise<{ body: Buffer; type: string } | null> {
  const file = resolveClientPath(clientDir, urlPath);
  if (file === null) return null;
  try {
    return { body: await readFile(file), type: contentTypeFor(file) };
  } catch {
    return null;
  }
}
