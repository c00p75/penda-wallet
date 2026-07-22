import { useEffect, useRef, useState } from 'react'
import { transcribeVoice } from './api'

export type VoiceRecorderState = 'idle' | 'recording' | 'transcribing'

/** Recordings shorter than this are discarded (no Whisper call). */
export const MIN_RECORD_MS = 400
/** Tiny blobs are treated as empty / too short. */
export const MIN_BLOB_BYTES = 256
/** Hard cap so a forgotten mic cannot run forever. */
export const MAX_RECORD_MS = 60_000

export interface VoiceStopResult {
  transcript: string
  /** Cancelled, aborted, or too short: caller must not auto-send. */
  discarded: boolean
}

interface VoiceRecorderOptions {
  onError: (message: string) => void
  currency?: string
  onLevel?: (level: number) => void
}

interface VoiceRecorder {
  state: VoiceRecorderState
  level: number
  start: () => Promise<void>
  /** Stops recording and resolves with the final Whisper transcript (may be empty). */
  stop: () => Promise<VoiceStopResult>
  /** Stops without uploading; releases the mic. */
  discard: () => Promise<void>
}

const CANDIDATE_MIME_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg']

type Lifecycle = 'idle' | 'starting' | 'recording' | 'stopping' | 'transcribing'

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'webm'
}

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

export function useVoiceRecorder({ onError, currency, onLevel }: VoiceRecorderOptions): VoiceRecorder {
  const [state, setState] = useState<VoiceRecorderState>('idle')
  const [level, setLevel] = useState(0)

  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const onLevelRef = useRef(onLevel)
  onLevelRef.current = onLevel
  const currencyRef = useRef(currency)
  currencyRef.current = currency

  const lifecycleRef = useRef<Lifecycle>('idle')
  const generationRef = useRef(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const startPromiseRef = useRef<Promise<void> | null>(null)
  const discardRequestedRef = useRef(false)
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const stopWaitersRef = useRef<Array<(result: VoiceStopResult) => void>>([])

  function publishLevel(next: number) {
    setLevel(next)
    onLevelRef.current?.(next)
  }

  function clearMaxTimer() {
    if (maxTimerRef.current != null) {
      clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }
  }

  function stopLevelMeter() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    analyserRef.current = null
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined)
      audioCtxRef.current = null
    }
    publishLevel(0)
  }

  function startLevelMeter(stream: MediaStream) {
    stopLevelMeter()
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.7
      source.connect(analyser)
      audioCtxRef.current = ctx
      analyserRef.current = analyser
      const data = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        const node = analyserRef.current
        if (!node) return
        node.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i]! - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        // Soft curve so quiet speech still moves the meter.
        const next = Math.min(1, rms * 4.5)
        publishLevel(next)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      // Meter is decorative; capture still works without it.
    }
  }

  function resolveStopWaiters(result: VoiceStopResult) {
    const waiters = stopWaitersRef.current
    stopWaitersRef.current = []
    for (const resolve of waiters) resolve(result)
  }

  function hardResetMic() {
    clearMaxTimer()
    stopLevelMeter()
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.onstop = null
        recorderRef.current.stop()
      }
    } catch {
      /* already stopped */
    }
    recorderRef.current = null
    stopTracks(streamRef.current)
    streamRef.current = null
    chunksRef.current = []
    abortRef.current?.abort()
    abortRef.current = null
  }

  function resetToIdle() {
    hardResetMic()
    discardRequestedRef.current = false
    lifecycleRef.current = 'idle'
    startPromiseRef.current = null
    setState('idle')
  }

  useEffect(() => {
    return () => {
      generationRef.current += 1
      hardResetMic()
      resolveStopWaiters({ transcript: '', discarded: true })
    }
  }, [])

  async function start() {
    if (lifecycleRef.current !== 'idle') {
      if (startPromiseRef.current) await startPromiseRef.current
      return
    }

    const generation = ++generationRef.current
    discardRequestedRef.current = false
    lifecycleRef.current = 'starting'

    const run = (async () => {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            channelCount: 1,
          },
        })
      } catch {
        lifecycleRef.current = 'idle'
        onErrorRef.current('Enable microphone access in your browser settings, then try again.')
        throw new Error('mic-denied')
      }

      if (generation !== generationRef.current || discardRequestedRef.current) {
        stopTracks(stream)
        lifecycleRef.current = 'idle'
        return
      }

      const mimeType = pickMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      streamRef.current = stream
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        void handleRecorderStop(generation, recorder)
      }

      try {
        recorder.start()
      } catch (error) {
        stopTracks(stream)
        streamRef.current = null
        recorderRef.current = null
        lifecycleRef.current = 'idle'
        setState('idle')
        onErrorRef.current(error instanceof Error ? error.message : 'Could not start recording.')
        throw error
      }

      if (generation !== generationRef.current || discardRequestedRef.current) {
        try {
          recorder.onstop = null
          if (recorder.state !== 'inactive') recorder.stop()
        } catch {
          /* ignore */
        }
        stopTracks(stream)
        streamRef.current = null
        recorderRef.current = null
        lifecycleRef.current = 'idle'
        setState('idle')
        resolveStopWaiters({ transcript: '', discarded: true })
        return
      }

      startedAtRef.current = performance.now()
      lifecycleRef.current = 'recording'
      setState('recording')
      startLevelMeter(stream)

      clearMaxTimer()
      maxTimerRef.current = setTimeout(() => {
        if (lifecycleRef.current === 'recording' && generation === generationRef.current) {
          void stop()
        }
      }, MAX_RECORD_MS)
    })()

    startPromiseRef.current = run.finally(() => {
      if (startPromiseRef.current === run) startPromiseRef.current = null
    })

    await startPromiseRef.current
  }

  async function handleRecorderStop(generation: number, recorder: MediaRecorder) {
    clearMaxTimer()
    stopLevelMeter()
    const stream = streamRef.current
    stopTracks(stream)
    streamRef.current = null
    recorderRef.current = null

    const elapsed = performance.now() - startedAtRef.current
    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
    chunksRef.current = []

    const shouldDiscard =
      discardRequestedRef.current ||
      generation !== generationRef.current ||
      elapsed < MIN_RECORD_MS ||
      blob.size < MIN_BLOB_BYTES

    if (shouldDiscard) {
      const tooShort =
        !discardRequestedRef.current &&
        generation === generationRef.current &&
        (elapsed < MIN_RECORD_MS || blob.size < MIN_BLOB_BYTES)
      if (tooShort) {
        onErrorRef.current('Hold a bit longer, then release to send.')
      }
      lifecycleRef.current = 'idle'
      setState('idle')
      discardRequestedRef.current = false
      resolveStopWaiters({ transcript: '', discarded: true })
      return
    }

    lifecycleRef.current = 'transcribing'
    setState('transcribing')
    const abort = new AbortController()
    abortRef.current = abort

    try {
      const transcript = await transcribeVoice(blob, `voice.${extensionFor(recorder.mimeType)}`, {
        currency: currencyRef.current,
        signal: abort.signal,
      })
      if (generation !== generationRef.current || abort.signal.aborted) {
        resolveStopWaiters({ transcript: '', discarded: true })
        return
      }
      resolveStopWaiters({ transcript: transcript.trim(), discarded: false })
    } catch (error) {
      if (generation !== generationRef.current || abort.signal.aborted) {
        resolveStopWaiters({ transcript: '', discarded: true })
        return
      }
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? ''
          : error instanceof Error
            ? error.message
            : 'Could not transcribe that recording.'
      if (message) {
        const rateLimited = /rate|limit|too many|try again later/i.test(message)
        onErrorRef.current(
          rateLimited
            ? 'Voice is busy right now. Wait a moment and try again.'
            : message,
        )
      }
      resolveStopWaiters({ transcript: '', discarded: true })
    } finally {
      if (abortRef.current === abort) abortRef.current = null
      if (generation === generationRef.current) {
        lifecycleRef.current = 'idle'
        setState('idle')
        discardRequestedRef.current = false
      }
    }
  }

  function requestRecorderStop(): Promise<VoiceStopResult> {
    return new Promise((resolve) => {
      stopWaitersRef.current.push(resolve)
      const recorder = recorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        // Still starting: waiter is resolved when start finishes into discard/stop.
        return
      }
      lifecycleRef.current = 'stopping'
      try {
        recorder.stop()
      } catch {
        resolveStopWaiters({ transcript: '', discarded: true })
        resetToIdle()
      }
    })
  }

  async function stop(): Promise<VoiceStopResult> {
    if (lifecycleRef.current === 'idle' && !startPromiseRef.current) {
      return { transcript: '', discarded: true }
    }

    if (lifecycleRef.current === 'starting' || startPromiseRef.current) {
      await startPromiseRef.current?.catch(() => undefined)
      if (discardRequestedRef.current || lifecycleRef.current === 'idle') {
        return { transcript: '', discarded: true }
      }
    }

    if (lifecycleRef.current === 'transcribing') {
      return new Promise((resolve) => {
        stopWaitersRef.current.push(resolve)
      })
    }

    if (lifecycleRef.current !== 'recording' && lifecycleRef.current !== 'stopping') {
      return { transcript: '', discarded: true }
    }

    return requestRecorderStop()
  }

  async function discard(): Promise<void> {
    discardRequestedRef.current = true
    generationRef.current += 1
    abortRef.current?.abort()

    if (lifecycleRef.current === 'starting' || startPromiseRef.current) {
      await startPromiseRef.current?.catch(() => undefined)
      hardResetMic()
      lifecycleRef.current = 'idle'
      setState('idle')
      resolveStopWaiters({ transcript: '', discarded: true })
      discardRequestedRef.current = false
      return
    }

    if (lifecycleRef.current === 'recording' || lifecycleRef.current === 'stopping') {
      await requestRecorderStop()
      return
    }

    if (lifecycleRef.current === 'transcribing') {
      abortRef.current?.abort()
      resetToIdle()
      resolveStopWaiters({ transcript: '', discarded: true })
      return
    }

    resetToIdle()
  }

  return { state, level, start, stop, discard }
}
