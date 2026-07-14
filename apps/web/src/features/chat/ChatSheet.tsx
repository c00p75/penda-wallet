import { useEffect, useRef, useState } from 'react'
import { Mic } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useKeyboardInset } from '@/lib/useKeyboardInset'
import { useSendChatMessage } from './hooks'
import { useVoiceRecorder } from './useVoiceRecorder'
import type { ChatMessage } from './types'

interface ChatSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  walletId: string | undefined
  initialInput?: string
  isVoicePremium: boolean
  onRequireVoicePremium: () => void
}

// A press shorter than this counts as a tap (hands-free record); longer counts
// as a hold-to-talk that sends on release, WhatsApp-style.
const HOLD_THRESHOLD_MS = 250

type RecordMode = 'idle' | 'holding' | 'locked'

let messageIdCounter = 0
const nextId = () => `msg-${++messageIdCounter}`

export function ChatSheet({
  open,
  onOpenChange,
  walletId,
  initialInput,
  isVoicePremium,
  onRequireVoicePremium,
}: ChatSheetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [input, setInput] = useState('')
  const [recordMode, setRecordMode] = useState<RecordMode>('idle')
  const sendMessage = useSendChatMessage(walletId)

  const keyboardInset = useKeyboardInset()

  // Text present before recording started, so live transcription appends
  // rather than clobbering what the user already typed.
  const baseInputRef = useRef('')
  const pressStartRef = useRef(0)
  const pointerHandledRef = useRef(false)

  useEffect(() => {
    if (open && initialInput) setInput(initialInput)
  }, [open, initialInput])

  const voice = useVoiceRecorder({
    onLiveTranscript: (transcript) => {
      const base = baseInputRef.current
      setInput(base && transcript ? `${base} ${transcript}` : base || transcript)
    },
    onError: (message) => {
      setRecordMode('idle')
      toast.error(message)
    },
  })

  function submitText(text: string) {
    const trimmed = text.trim()
    if (!trimmed || sendMessage.isPending) return

    setMessages((prev) => [...prev, { id: nextId(), role: 'user', text: trimmed }])
    setInput('')

    sendMessage
      .mutateAsync({ message: trimmed, conversationId })
      .then((result) => {
        setConversationId(result.conversationId)
        setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: result.reply }])
      })
      .catch((error) => {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            text: error instanceof Error ? `Something went wrong: ${error.message}` : 'Something went wrong.',
          },
        ])
      })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    submitText(input)
  }

  // Merge the just-finished recording's final transcript with whatever the user
  // had typed beforehand. For the live path the input is already up to date; for
  // the server-transcription fallback this is where the text first lands.
  function mergedTranscript(finalText: string) {
    const base = baseInputRef.current
    return base && finalText ? `${base} ${finalText}` : base || finalText
  }

  async function beginRecording() {
    baseInputRef.current = input
    await voice.start()
  }

  async function finishRecording(submit: boolean) {
    const finalText = await voice.stop()
    setRecordMode('idle')
    const combined = mergedTranscript(finalText)
    if (submit) submitText(combined)
    else setInput(combined)
  }

  function onMicPointerDown() {
    pointerHandledRef.current = true

    // A tap while already recording hands-free stops and keeps the text for review.
    if (recordMode === 'locked') {
      finishRecording(false)
      return
    }
    if (recordMode !== 'idle') return
    if (!isVoicePremium) {
      onRequireVoicePremium()
      return
    }

    pressStartRef.current = performance.now()
    setRecordMode('holding')
    beginRecording()
  }

  function onMicPointerUp() {
    if (recordMode !== 'holding') return
    const held = performance.now() - pressStartRef.current
    if (held >= HOLD_THRESHOLD_MS) {
      finishRecording(true) // held long enough → send on release
    } else {
      setRecordMode('locked') // quick tap → keep recording hands-free
    }
  }

  function onMicPointerCancel() {
    // System interruption (call, app switch): stop but keep the text for review.
    if (recordMode === 'holding') finishRecording(false)
  }

  // Keyboard activation (Enter/Space) fires click without pointer events; treat
  // it as a hands-free toggle. Pointer taps also fire click, so ignore those.
  function onMicClick() {
    if (pointerHandledRef.current) {
      pointerHandledRef.current = false
      return
    }
    if (recordMode === 'idle') {
      if (!isVoicePremium) {
        onRequireVoicePremium()
        return
      }
      setRecordMode('locked')
      beginRecording()
    } else {
      finishRecording(false)
    }
  }

  const isRecording = recordMode !== 'idle'
  const statusText =
    voice.state === 'transcribing'
      ? 'Transcribing…'
      : recordMode === 'holding'
        ? 'Listening — release to send'
        : recordMode === 'locked'
          ? 'Listening — tap the mic to stop'
          : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[85svh] flex-col"
        // Lift the sheet's contents clear of the on-screen keyboard so the input
        // and buttons stay visible while typing.
        style={keyboardInset ? { paddingBottom: keyboardInset } : undefined}
      >
        <SheetHeader>
          <SheetTitle>Chat with Penda</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          {messages.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Tell me about a purchase or payment — "spent $12 on coffee at Blue Bottle", or hold the
              mic to say it and release to send.
            </p>
          )}
          <div className="flex flex-col gap-3 pb-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === 'user'
                    ? 'ml-auto max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
                    : 'mr-auto max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm'
                }
              >
                {m.text}
              </div>
            ))}
            {sendMessage.isPending && (
              <div className="mr-auto max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                Thinking…
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="border-t p-4">
          {statusText && (
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
              </span>
              {statusText}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isRecording ? 'Listening…' : 'I spent $12 on coffee...'}
              autoComplete="off"
            />
            <Button
              type="button"
              variant={isRecording ? 'destructive' : 'outline'}
              size="icon"
              disabled={voice.state === 'transcribing'}
              onPointerDown={onMicPointerDown}
              onPointerUp={onMicPointerUp}
              onPointerCancel={onMicPointerCancel}
              onContextMenu={(e) => e.preventDefault()}
              onClick={onMicClick}
              className={cn('touch-none', isRecording && 'animate-pulse')}
              aria-label={isRecording ? 'Stop recording' : 'Hold to talk, or tap to record'}
              aria-pressed={isRecording}
            >
              <Mic className="size-4" />
            </Button>
            <Button type="submit" disabled={sendMessage.isPending}>
              Send
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
