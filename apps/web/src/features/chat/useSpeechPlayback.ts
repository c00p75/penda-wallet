import { useCallback, useEffect, useRef, useState } from 'react'
import { synthesizeSpeech } from './api'

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

/**
 * Speaks an assistant reply aloud, one persona voice per message. Audio is
 * synthesized lazily and cached in-memory per message id for the life of the
 * sheet, never persisted (the message list itself is localStorage-persisted,
 * base64 audio would bloat it well past what's worth keeping across reloads).
 */
export function useSpeechPlayback() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cacheRef = useRef<Map<string, string>>(new Map()) // messageId -> object URL
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current = null
    }
    setSpeakingId(null)
  }, [])

  const reset = useCallback(() => {
    stop()
    cacheRef.current.forEach((url) => URL.revokeObjectURL(url))
    cacheRef.current.clear()
  }, [stop])

  /** Resolves once playback ends (or fails) so callers can sequence after it. */
  const speak = useCallback(
    async (messageId: string, text: string, personality: string): Promise<void> => {
      stop()
      if (!text.trim()) return

      let url = cacheRef.current.get(messageId)
      if (!url) {
        setLoadingId(messageId)
        try {
          const { audio, mimeType } = await synthesizeSpeech(text, personality)
          url = URL.createObjectURL(base64ToBlob(audio, mimeType))
          cacheRef.current.set(messageId, url)
        } catch (error) {
          console.error('Speech synthesis failed:', error instanceof Error ? error.message : error)
          return
        } finally {
          setLoadingId((id) => (id === messageId ? null : id))
        }
      }

      const el = new Audio(url)
      audioRef.current = el
      setSpeakingId(messageId)
      await new Promise<void>((resolve) => {
        el.onended = () => resolve()
        el.onerror = () => resolve()
        el.play().catch(() => resolve())
      })
      if (audioRef.current === el) {
        audioRef.current = null
        setSpeakingId((id) => (id === messageId ? null : id))
      }
    },
    [stop],
  )

  useEffect(() => () => reset(), [reset])

  return { speak, stop, reset, speakingId, loadingId }
}
