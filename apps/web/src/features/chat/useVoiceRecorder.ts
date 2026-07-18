import { useEffect, useRef, useState } from 'react'
import { transcribeVoice } from './api'

export type VoiceRecorderState = 'idle' | 'recording' | 'transcribing'

interface VoiceRecorderOptions {
  /** Called repeatedly with the transcript-so-far while recording (live mode only). */
  onLiveTranscript: (text: string) => void
  onError: (message: string) => void
}

interface VoiceRecorder {
  state: VoiceRecorderState
  /** True when the browser can transcribe live as the user speaks. */
  supportsLive: boolean
  start: () => Promise<void>
  /** Stops recording and resolves with the final transcript (may be empty). */
  stop: () => Promise<string>
}

const CANDIDATE_MIME_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg']

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'webm'
}

function getSpeechRecognition(): (new () => SpeechRecognition) | undefined {
  if (typeof window === 'undefined') return undefined
  return window.SpeechRecognition ?? window.webkitSpeechRecognition
}

export function useVoiceRecorder({ onLiveTranscript, onError }: VoiceRecorderOptions): VoiceRecorder {
  const [state, setState] = useState<VoiceRecorderState>('idle')

  // Keep the latest callbacks in refs so the recognition/recorder event
  // handlers always see current values without re-subscribing.
  const onLiveTranscriptRef = useRef(onLiveTranscript)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onLiveTranscriptRef.current = onLiveTranscript
    onErrorRef.current = onError
  })

  const SpeechRecognitionCtor = getSpeechRecognition()
  const supportsLive = Boolean(SpeechRecognitionCtor)

  // --- Live path (Web Speech API) ---
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const finalTranscriptRef = useRef('')
  // Text finalized in *previous* recognition sessions. Android ends the session
  // on every pause (see onend), and each new session resets event.results to an
  // empty list, so we stash prior finals here and prepend them.
  const committedTranscriptRef = useRef('')
  const stopResolveRef = useRef<((text: string) => void) | null>(null)
  const stopRequestedRef = useRef(false)

  // --- Fallback path (MediaRecorder + server transcription) ---
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  async function startLive() {
    const recognition = new SpeechRecognitionCtor!()
    recognition.lang = navigator.language || 'en-US'
    recognition.continuous = true
    recognition.interimResults = true

    finalTranscriptRef.current = ''
    committedTranscriptRef.current = ''
    stopRequestedRef.current = false

    recognition.onresult = (event) => {
      // Rebuild from the full results list every event rather than appending , 
      // Android Chrome re-delivers already-finalized results with resultIndex
      // stuck at 0, so an incremental `+=` double-counts them ("todaytoday…").
      // Assigning the recomputed value each time keeps the handler idempotent.
      let sessionFinal = ''
      let interim = ''
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) sessionFinal += result[0].transcript
        else interim += result[0].transcript
      }
      finalTranscriptRef.current = committedTranscriptRef.current + sessionFinal
      onLiveTranscriptRef.current((finalTranscriptRef.current + interim).trim())
    }

    recognition.onerror = (event) => {
      // "no-speech" / "aborted" fire during normal use, only surface real faults.
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        onErrorRef.current('Microphone access was denied.')
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        onErrorRef.current('Could not hear that, please try again.')
      }
    }

    recognition.onend = () => {
      // Android often ends the session after a pause. If the user hasn't let go
      // yet, transparently resume so holding keeps recording.
      if (!stopRequestedRef.current) {
        // Preserve what's been finalized so far; the resumed session starts with
        // a fresh, empty results list.
        committedTranscriptRef.current = finalTranscriptRef.current
        try {
          recognition.start()
          return
        } catch {
          // Fall through to settle below if we can't restart.
        }
      }
      setState('idle')
      recognitionRef.current = null
      stopResolveRef.current?.(finalTranscriptRef.current.trim())
      stopResolveRef.current = null
    }

    recognitionRef.current = recognition
    recognition.start()
    setState('recording')
  }

  async function startFallback() {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      onErrorRef.current('Microphone access was denied.')
      throw new Error('mic-denied')
    }

    const mimeType = pickMimeType()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    chunksRef.current = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop())
      setState('transcribing')
      try {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        const transcript = await transcribeVoice(blob, `voice.${extensionFor(recorder.mimeType)}`)
        stopResolveRef.current?.(transcript.trim())
      } catch (error) {
        onErrorRef.current(error instanceof Error ? error.message : 'Could not transcribe that recording.')
        stopResolveRef.current?.('')
      } finally {
        stopResolveRef.current = null
        setState('idle')
      }
    }

    recorderRef.current = recorder
    recorder.start()
    setState('recording')
  }

  async function start() {
    if (state !== 'idle') return
    if (supportsLive) await startLive()
    else await startFallback()
  }

  function stop(): Promise<string> {
    return new Promise((resolve) => {
      stopResolveRef.current = resolve
      if (recognitionRef.current) {
        stopRequestedRef.current = true
        recognitionRef.current.stop()
      } else if (recorderRef.current) {
        recorderRef.current.stop()
      } else {
        resolve('')
      }
    })
  }

  return { state, supportsLive, start, stop }
}
