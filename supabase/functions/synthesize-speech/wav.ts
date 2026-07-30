// Gemini TTS returns headerless 16-bit PCM (mono, 24kHz), which no audio
// element or expo-av Sound can play directly, it needs a container. These are
// pure helpers (no Deno/network APIs) so they're unit-testable in isolation.

/** Decode a base64 string to raw bytes. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Encode raw bytes to base64, chunked so large buffers don't blow the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE))
  }
  return btoa(binary)
}

/**
 * Wrap raw 16-bit PCM audio in a 44-byte RIFF/WAVE header so it becomes a
 * playable .wav file. Gemini's TTS models emit mono 24kHz PCM16 by default.
 */
export function pcmToWavBase64(
  pcmBase64: string,
  { sampleRate = 24000, channels = 1, bitsPerSample = 16 } = {},
): string {
  const pcmBytes = base64ToBytes(pcmBase64)
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8
  const dataSize = pcmBytes.length

  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  new Uint8Array(buffer, 44).set(pcmBytes)
  return bytesToBase64(new Uint8Array(buffer))
}
