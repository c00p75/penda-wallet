import { useRef, useState } from 'react'
import { transcribeVoice } from './api'

export type VoiceRecorderState = 'idle' | 'recording' | 'transcribing'

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

export function useVoiceRecorder(onTranscript: (text: string) => void, onError: (message: string) => void) {
  const [state, setState] = useState<VoiceRecorderState>('idle')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  async function start() {
    if (state !== 'idle') return

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      onError('Microphone access was denied.')
      return
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
        const extension = extensionFor(recorder.mimeType)
        const transcript = await transcribeVoice(blob, `voice.${extension}`)
        onTranscript(transcript)
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Could not transcribe that recording.')
      } finally {
        setState('idle')
      }
    }

    recorderRef.current = recorder
    recorder.start()
    setState('recording')
  }

  function stop() {
    recorderRef.current?.stop()
  }

  return { state, start, stop }
}
