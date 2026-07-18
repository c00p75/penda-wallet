// Local PIN hashing for the balance lock. The PIN never leaves the device and
// is never sent to the server, it's a local reveal gate, so we hash it with
// PBKDF2 (Web Crypto) and keep only salt + hash in local storage.

const ITERATIONS = 100_000
const KEY_BITS = 256

export function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

export function generateSalt(): string {
  return bufToB64(crypto.getRandomValues(new Uint8Array(16)))
}

export async function hashPin(pin: string, saltB64: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: b64ToBytes(saltB64) as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    KEY_BITS,
  )
  return bufToB64(bits)
}

/** Constant-time-ish string compare so a wrong PIN can't be timed out digit by digit. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyPin(pin: string, saltB64: string, hashB64: string): Promise<boolean> {
  return safeEqual(await hashPin(pin, saltB64), hashB64)
}
