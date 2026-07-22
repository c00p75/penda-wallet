import { useEffect, useRef } from 'react'

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Browser interim captions while recording. Whisper remains the source of truth
 * after stop; this only paints rolling text in the composer when supported.
 */
export function useSpeechInterim(opts: {
  active: boolean
  onInterim: (text: string) => void
}) {
  const onInterimRef = useRef(opts.onInterim)
  onInterimRef.current = opts.onInterim

  useEffect(() => {
    if (!opts.active) return
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return

    let recognition: SpeechRecognitionLike | null = null
    let stopped = false
    let finals = ''

    try {
      recognition = new Ctor()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onresult = (event) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i]
          if (!piece) continue
          const text = piece[0]?.transcript ?? ''
          if (piece.isFinal) finals = `${finals} ${text}`.trim()
          else interim += text
        }
        const combined = `${finals} ${interim}`.trim()
        if (combined) onInterimRef.current(combined)
      }

      recognition.onerror = () => {
        // Silent fallback: Whisper still runs after stop.
      }

      recognition.onend = () => {
        // Chrome ends recognition periodically; restart while still active.
        if (!stopped && opts.active) {
          try {
            recognition?.start()
          } catch {
            /* already started */
          }
        }
      }

      recognition.start()
    } catch {
      recognition = null
    }

    return () => {
      stopped = true
      try {
        recognition?.abort()
      } catch {
        try {
          recognition?.stop()
        } catch {
          /* ignore */
        }
      }
    }
  }, [opts.active])
}
