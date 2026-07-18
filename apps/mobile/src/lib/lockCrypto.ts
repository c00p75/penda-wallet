import * as ExpoCrypto from 'expo-crypto';

const ITERATIONS = 100_000;
const KEY_BITS = 256;

function toBytes(buf: ArrayBuffer | Uint8Array): Uint8Array {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

export function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = toBytes(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  if (typeof globalThis.btoa === 'function') return globalThis.btoa(binary);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    result += chars[a >> 2];
    result += chars[((a & 3) << 4) | (b >> 4)];
    result += i + 1 < bytes.length ? chars[((b & 15) << 2) | (c >> 6)] : '=';
    result += i + 2 < bytes.length ? chars[c & 63] : '=';
  }
  return result;
}

export function b64ToBytes(b64: string): Uint8Array {
  if (typeof globalThis.atob === 'function') {
    return Uint8Array.from(globalThis.atob(b64), (c) => c.charCodeAt(0));
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/=+$/, '');
  const len = clean.length;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = chars.indexOf(clean[i] ?? 'A');
    const b = chars.indexOf(clean[i + 1] ?? 'A');
    const c = chars.indexOf(clean[i + 2] ?? 'A');
    const d = chars.indexOf(clean[i + 3] ?? 'A');
    out[p++] = (a << 2) | (b >> 4);
    if (i + 2 < len) out[p++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < len) out[p++] = ((c & 3) << 6) | d;
  }
  return out.slice(0, p);
}

export function generateSalt(): string {
  return bufToB64(ExpoCrypto.getRandomBytes(16));
}

async function getSubtleCrypto(): Promise<SubtleCrypto> {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.subtle) {
    throw new Error('Secure crypto is not available on this device.');
  }
  return cryptoObj.subtle;
}

export async function hashPin(pin: string, saltB64: string): Promise<string> {
  const subtle = await getSubtleCrypto();
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: b64ToBytes(saltB64) as unknown as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    KEY_BITS,
  );
  return bufToB64(bits);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPin(pin: string, saltB64: string, hashB64: string): Promise<boolean> {
  return safeEqual(await hashPin(pin, saltB64), hashB64);
}
