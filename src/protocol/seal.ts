import { b64uToBytes } from './bytes.ts';
import type { StationKey } from './keyring.ts';

const imported = new WeakMap<StationKey, Promise<CryptoKey>>();

function importKey(key: StationKey): Promise<CryptoKey> {
  let p = imported.get(key);
  if (!p) {
    p = crypto.subtle.importKey('raw', key.publicKey, { name: 'Ed25519' }, false, ['verify']);
    imported.set(key, p);
  }
  return p;
}

export async function verifySeal(
  key: StationKey,
  sealB64u: string,
  frameText: string,
): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{86}$/.test(sealB64u)) return false;
  try {
    return await crypto.subtle.verify(
      { name: 'Ed25519' },
      await importKey(key),
      b64uToBytes(sealB64u),
      new TextEncoder().encode(frameText),
    );
  } catch {
    return false;
  }
}
