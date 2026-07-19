import { useRef, useState } from 'react'
import { transcribeVoice } from './api'

export type VoiceRecorderState = 'idle' | 'recording' | 'transcribing'

interface VoiceRecorderOptions {
  onError: (message: string) => void
}

interface VoiceRecorder {
  state: VoiceRecorderState
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

export function useVoiceRecorder({ onError }: VoiceRecorderOptions): VoiceRecorder {
  const [state, setState] = useState<VoiceRecorderState>('idle')

  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const stopResolveRef = useRef<((text: string) => void) | null>(null)

  async function start() {
    if (state !== 'idle') return

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

  function stop(): Promise<string> {
    return new Promise((resolve) => {
      if (!recorderRef.current) {
        resolve('')
        return
      }
      stopResolveRef.current = resolve
      recorderRef.current.stop()
    })
  }

  return { state, start, stop }
}
