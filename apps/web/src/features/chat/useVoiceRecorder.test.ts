import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { MIN_RECORD_MS, useVoiceRecorder } from './useVoiceRecorder'

const transcribeVoice = vi.fn()

vi.mock('./api', () => ({
  transcribeVoice: (...args: unknown[]) => transcribeVoice(...args),
}))

class FakeMediaRecorder {
  static isTypeSupported = () => true
  mimeType = 'audio/webm'
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null

  start() {
    this.state = 'recording'
  }

  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob([new Uint8Array(512)], { type: 'audio/webm' }) })
    this.onstop?.()
  }
}

function mockMedia(streamTracksStop = vi.fn()) {
  const track = { stop: streamTracksStop }
  const stream = { getTracks: () => [track] } as unknown as MediaStream
  vi.stubGlobal(
    'navigator',
    {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
    },
  )
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  vi.stubGlobal(
    'AudioContext',
    class {
      createMediaStreamSource() {
        return { connect: vi.fn() }
      }
      createAnalyser() {
        return {
          fftSize: 0,
          smoothingTimeConstant: 0,
          frequencyBinCount: 8,
          getByteTimeDomainData: (arr: Uint8Array) => {
            arr.fill(128)
          },
        }
      }
      close = vi.fn().mockResolvedValue(undefined)
    },
  )
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    return window.setTimeout(() => cb(performance.now()), 0) as unknown as number
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
}

describe('useVoiceRecorder', () => {
  beforeEach(() => {
    transcribeVoice.mockReset()
    transcribeVoice.mockResolvedValue(' spent 12 on coffee ')
    mockMedia()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('does not resolve stop empty while getUserMedia is still pending', async () => {
    let resolveMedia!: (stream: MediaStream) => void
    const trackStop = vi.fn()
    const stream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream
    ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveMedia = resolve
        }),
    )

    const onError = vi.fn()
    const { result } = renderHook(() => useVoiceRecorder({ onError }))

    let stopSettled = false
    let stopPromise!: Promise<Awaited<ReturnType<typeof result.current.stop>>>
    await act(async () => {
      void result.current.start()
      stopPromise = result.current.stop().then((value) => {
        stopSettled = true
        return value
      })
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(stopSettled).toBe(false)

    await act(async () => {
      resolveMedia(stream)
      await stopPromise
    })
    expect(stopSettled).toBe(true)
  })

  it('returns Whisper text after a long enough recording', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useVoiceRecorder({ onError, currency: 'ZMW' }))

    await act(async () => {
      await result.current.start()
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, MIN_RECORD_MS + 30))
    })

    let stopResult!: Awaited<ReturnType<typeof result.current.stop>>
    await act(async () => {
      stopResult = await result.current.stop()
    })

    expect(stopResult.discarded).toBe(false)
    expect(stopResult.transcript).toBe('spent 12 on coffee')
    expect(transcribeVoice).toHaveBeenCalledWith(
      expect.any(Blob),
      'voice.webm',
      expect.objectContaining({ currency: 'ZMW' }),
    )
  })

  it('discards too-short recordings without calling Whisper', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const { result } = renderHook(() => useVoiceRecorder({ onError }))

    await act(async () => {
      await result.current.start()
    })

    let stopResult!: Awaited<ReturnType<typeof result.current.stop>>
    await act(async () => {
      const p = result.current.stop()
      await vi.advanceTimersByTimeAsync(MIN_RECORD_MS - 50)
      stopResult = await p
    })

    expect(stopResult.discarded).toBe(true)
    expect(transcribeVoice).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('Hold a bit longer, then release to send.')
  })

  it('discard cancels an in-flight transcription result', async () => {
    let resolveTranscribe!: (value: string) => void
    transcribeVoice.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveTranscribe = resolve
        }),
    )

    const onError = vi.fn()
    const { result } = renderHook(() => useVoiceRecorder({ onError }))

    await act(async () => {
      await result.current.start()
    })

    // Ensure min duration passes.
    await act(async () => {
      await new Promise((r) => setTimeout(r, MIN_RECORD_MS + 20))
    })

    let stopPromise!: Promise<Awaited<ReturnType<typeof result.current.stop>>>
    await act(async () => {
      stopPromise = result.current.stop()
    })

    await waitFor(() => expect(result.current.state).toBe('transcribing'))

    await act(async () => {
      await result.current.discard()
    })

    resolveTranscribe('late transcript')
    const stopResult = await stopPromise
    expect(stopResult.discarded).toBe(true)
    expect(stopResult.transcript).toBe('')
  })
})
