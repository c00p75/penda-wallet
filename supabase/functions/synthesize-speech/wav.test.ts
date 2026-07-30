import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { base64ToBytes, bytesToBase64, pcmToWavBase64 } from './wav.ts'

Deno.test('bytesToBase64 round-trips through base64ToBytes', () => {
  const original = new Uint8Array([0, 1, 2, 254, 255, 128, 64])
  const roundTripped = base64ToBytes(bytesToBase64(original))
  assertEquals(roundTripped, original)
})

Deno.test('bytesToBase64 handles buffers larger than the chunk size', () => {
  const large = new Uint8Array(0x8000 + 137).map((_, i) => i % 256)
  const roundTripped = base64ToBytes(bytesToBase64(large))
  assertEquals(roundTripped, large)
})

Deno.test('pcmToWavBase64 prepends a valid 44-byte RIFF/WAVE header', () => {
  const pcm = new Uint8Array([10, 20, 30, 40])
  const wavBytes = base64ToBytes(pcmToWavBase64(bytesToBase64(pcm)))

  assertEquals(wavBytes.length, 44 + pcm.length)

  const view = new DataView(wavBytes.buffer)
  const readString = (offset: number, len: number) =>
    String.fromCharCode(...wavBytes.subarray(offset, offset + len))

  assertEquals(readString(0, 4), 'RIFF')
  assertEquals(view.getUint32(4, true), 36 + pcm.length)
  assertEquals(readString(8, 4), 'WAVE')
  assertEquals(readString(12, 4), 'fmt ')
  assertEquals(view.getUint32(16, true), 16)
  assertEquals(view.getUint16(20, true), 1) // PCM
  assertEquals(view.getUint16(22, true), 1) // mono
  assertEquals(view.getUint32(24, true), 24000) // sample rate
  assertEquals(view.getUint16(34, true), 16) // bits per sample
  assertEquals(readString(36, 4), 'data')
  assertEquals(view.getUint32(40, true), pcm.length)
  assertEquals(wavBytes.subarray(44), pcm)
})

Deno.test('pcmToWavBase64 respects custom sample rate / channels', () => {
  const pcm = new Uint8Array(8)
  const wavBytes = base64ToBytes(
    pcmToWavBase64(bytesToBase64(pcm), { sampleRate: 16000, channels: 2, bitsPerSample: 16 }),
  )
  const view = new DataView(wavBytes.buffer)
  assertEquals(view.getUint32(24, true), 16000)
  assertEquals(view.getUint16(22, true), 2)
  assertEquals(view.getUint16(32, true), 4) // blockAlign = channels * bitsPerSample/8
  assertEquals(view.getUint32(28, true), 64000) // byteRate = rate * channels * bitsPerSample/8
})
