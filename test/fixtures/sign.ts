import { sha256Hex } from '../../src/protocol/bytes.ts';

const keyPair = await crypto.subtle.generateKey(
  { name: 'Ed25519' },
  true,
  ['sign', 'verify'],
) as CryptoKeyPair;

const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));

function bytesToB64u(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export const GENERATED_PUBLIC_KEY = bytesToB64u(publicKeyBytes);
export const GENERATED_FINGERPRINT = await sha256Hex(publicKeyBytes);
export const GENERATED_KEY_ID = GENERATED_FINGERPRINT.slice(0, 16);

export async function sealFrame(frameText: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    'Ed25519',
    keyPair.privateKey,
    new TextEncoder().encode(frameText),
  );
  return bytesToB64u(new Uint8Array(signature));
}
