import { b64uToBytes, sha256Hex } from './bytes.ts';

export type StationKey = {
  id: string;
  publicKey: Uint8Array;
  fingerprint: string;
};

export async function makeStationKey(
  publicKeyB64u: string,
  expectedFingerprint: string,
): Promise<StationKey> {
  const publicKey = b64uToBytes(publicKeyB64u);
  if (publicKey.length !== 32) {
    throw new Error(`station key must be 32 bytes, got ${publicKey.length}`);
  }
  const fingerprint = await sha256Hex(publicKey);
  if (fingerprint !== expectedFingerprint.toLowerCase()) {
    throw new Error(
      `station key fingerprint mismatch: got ${fingerprint}, expected ${expectedFingerprint}`,
    );
  }
  return { id: fingerprint.slice(0, 16), publicKey, fingerprint };
}

export class KeyRing {
  #keys = new Map<string, StationKey>();

  add(key: StationKey): void {
    this.#keys.set(key.id, key);
  }

  get(id: string): StationKey | undefined {
    return this.#keys.get(id);
  }

  has(id: string): boolean {
    return this.#keys.has(id);
  }
}
