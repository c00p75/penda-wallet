import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Mic, X } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { currencySymbol } from '@/lib/currencies'
import { useKeyboardInset } from '@/lib/useKeyboardInset'
import { useCloseOnBack } from '@/lib/useCloseOnBack'
import { supabase } from '@/lib/supabase/client'
import { enqueueChatMessage } from '@/pwa/offlineQueue'
import { useAuthStore } from '@/store/authStore'
import { useProfile } from '@/features/profile/hooks'
import { PersonaAvatar } from '@/features/profile/PersonaAvatar'
import { PERSONALITIES } from '@/features/profile/types'
import { useConfirmAiAction, useSendChatMessage } from './hooks'
import { useVoiceRecorder } from './useVoiceRecorder'
import type { PageContext } from './pageContext'
import type { ChatMessage, PendingAction } from './types'

const TOOL_PROGRESS_COPY: Record<string, string> = {
  create_transaction: 'Logging that…',
  get_budget_progress: 'Checking your budgets…',
  query_records: 'Looking that up…',
  get_spending_summary: 'Tallying your spend…',
  create_budget: 'Setting up a budget…',
  create_goal: 'Setting up a goal…',
  log_borrowed_or_lent_money: 'Recording the loan…',
  save_memory: 'Remembering that…',
}

function viewHrefFor(domain: string, targetId?: string): string | undefined {
  switch (domain) {
    case 'transaction':
      return '/transactions'
    case 'budget':
      return '/budgets'
    case 'goal':
      return targetId ? `/goals/${targetId}` : '/goals'
    case 'debt':
      return '/goals'
    default:
      return undefined
  }
}

interface ChatSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  walletId: string | undefined
  initialInput?: string
  /** Send `initialInput` immediately on open so Penda replies first. */
  autoSend?: boolean
  /** Called once the auto-send has fired, so the caller can clear the flag. */
  onAutoSendConsumed?: () => void
  currency?: string
  pageContext?: PageContext
}

// A press shorter than this counts as a tap (hands-free record); longer counts
// as a hold-to-talk that sends on release, WhatsApp-style.
const HOLD_THRESHOLD_MS = 250

type RecordMode = 'idle' | 'holding' | 'locked'

const nextId = () => crypto.randomUUID()

// Conversation history persists across app reloads, scoped per wallet and
// capped so localStorage can't grow without bound over a long relationship
// with Penda.
const MAX_STORED_MESSAGES = 50

interface StoredChat {
  conversationId?: string
  messages: ChatMessage[]
  actionStatus: Record<string, 'confirmed' | 'cancelled'>
}

function storageKeyFor(walletId: string | undefined) {
  return walletId ? `penda:chat:${walletId}` : null
}

function loadStoredChat(walletId: string | undefined): StoredChat {
  const key = storageKeyFor(walletId)
  if (!key) return { messages: [], actionStatus: {} }
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { messages: [], actionStatus: {} }
    const parsed = JSON.parse(raw) as Partial<StoredChat>
    return {
      conversationId: parsed.conversationId,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      actionStatus: parsed.actionStatus ?? {},
    }
  } catch {
    return { messages: [], actionStatus: {} }
  }
}

const SUGGESTED_PROMPTS = ['What did I spend this week?', 'How are my budgets doing?', 'Help me build a budget']

export function ChatSheet({
  open,
  onOpenChange,
  walletId,
  initialInput,
  autoSend = false,
  onAutoSendConsumed,
  currency = 'USD',
  pageContext,
}: ChatSheetProps) {
  const navigate = useNavigate()
  const sym = currencySymbol(currency)
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadStoredChat(walletId).messages)
  const [conversationId, setConversationId] = useState<string | undefined>(
    () => loadStoredChat(walletId).conversationId,
  )
  const [input, setInput] = useState('')
  const [recordMode, setRecordMode] = useState<RecordMode>('idle')
  // How each staged action resolved, so its card locks after Yes/Cancel.
  const [actionStatus, setActionStatus] = useState<Record<string, 'confirmed' | 'cancelled'>>(
    () => loadStoredChat(walletId).actionStatus,
  )
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [toolProgress, setToolProgress] = useState<string | null>(null)
  const sentConversationIdRef = useRef(conversationId)

  // Persist across app reloads — restored above via loadStoredChat's lazy init.
  useEffect(() => {
    const key = storageKeyFor(walletId)
    if (!key) return
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          conversationId,
          messages: messages.slice(-MAX_STORED_MESSAGES),
          actionStatus,
        } satisfies StoredChat),
      )
    } catch {
      // Storage full or unavailable (e.g. private browsing) — history just won't persist.
    }
  }, [walletId, messages, conversationId, actionStatus])
  const sendMessage = useSendChatMessage(walletId)
  const confirmAction = useConfirmAiAction(walletId)
  const session = useAuthStore((s) => s.session)
  const { data: profile } = useProfile(session?.user.id)
  const persona = PERSONALITIES.find((p) => p.value === profile?.ai_personality) ?? PERSONALITIES[0]

  const keyboardInset = useKeyboardInset()
  useCloseOnBack(open, () => onOpenChange(false))

  // Text present before recording started, so live transcription appends
  // rather than clobbering what the user already typed.
  const baseInputRef = useRef('')
  const pressStartRef = useRef(0)
  const pointerHandledRef = useRef(false)
  // Guards the auto-send so a seeded prompt fires once per open, not on every
  // re-render while the sheet is up.
  const autoSentRef = useRef(false)

  useEffect(() => {
    if (!open) {
      autoSentRef.current = false
      return
    }
    if (!initialInput) return
    if (autoSend && !autoSentRef.current) {
      autoSentRef.current = true
      onAutoSendConsumed?.()
      submitText(initialInput)
    } else if (!autoSend) {
      setInput(initialInput)
    }
    // submitText is a stable closure over state we intentionally read at fire time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialInput, autoSend])

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

  // Appends a message, keeping the list capped to what we're willing to persist.
  function pushMessage(message: ChatMessage) {
    setMessages((prev) => [...prev, message].slice(-MAX_STORED_MESSAGES))
  }

  // Swaps a message in place (used to turn a failed error bubble into the
  // retried reply) instead of appending, so retrying doesn't leave the old
  // failure sitting above the new result.
  function replaceMessage(id: string, message: ChatMessage) {
    setMessages((prev) => [...prev.filter((m) => m.id !== id), message].slice(-MAX_STORED_MESSAGES))
  }

  // Subscribe for tool-progress broadcasts while a send is in flight.
  useEffect(() => {
    if (!sendMessage.isPending || !conversationId) {
      setToolProgress(null)
      return
    }
    const channel = supabase.channel(`chat:${conversationId}`)
    channel
      .on('broadcast', { event: 'tool' }, ({ payload }) => {
        const tool = typeof payload?.tool === 'string' ? payload.tool : ''
        setToolProgress(TOOL_PROGRESS_COPY[tool] ?? 'Working on it…')
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
      setToolProgress(null)
    }
  }, [sendMessage.isPending, conversationId])

  // The network round-trip shared by a fresh send and a retry. `replaceId`,
  // when set, is the failed bubble being retried — its error is replaced by
  // the outcome rather than appending a new one.
  function sendToAssistant(text: string, replaceId?: string) {
    sentConversationIdRef.current = conversationId
    sendMessage
      .mutateAsync({ message: text, conversationId, pageContext })
      .then((result) => {
        const rotated =
          !!sentConversationIdRef.current && sentConversationIdRef.current !== result.conversationId
        setConversationId(result.conversationId)
        if (rotated) {
          pushMessage({
            id: nextId(),
            role: 'assistant',
            text: '— new session —',
          })
        }
        const reply: ChatMessage = {
          id: nextId(),
          role: 'assistant',
          text: result.reply,
          pendingActions: result.pendingActions?.length ? result.pendingActions : undefined,
        }
        if (replaceId) replaceMessage(replaceId, reply)
        else pushMessage(reply)
      })
      .catch(async (error) => {
        const networkFail =
          !navigator.onLine ||
          (error instanceof TypeError) ||
          (error instanceof Error && /fetch|network/i.test(error.message))
        if (networkFail && walletId && !replaceId) {
          try {
            await enqueueChatMessage(walletId, text)
            pushMessage({
              id: nextId(),
              role: 'assistant',
              text: 'Queued — sends when you’re back online.',
              queued: true,
            })
            return
          } catch {
            /* fall through to error bubble */
          }
        }
        const errorMessage: ChatMessage = {
          id: nextId(),
          role: 'assistant',
          text: error instanceof Error ? `Something went wrong: ${error.message}` : 'Something went wrong.',
          retryText: text,
        }
        if (replaceId) replaceMessage(replaceId, errorMessage)
        else pushMessage(errorMessage)
      })
  }

  function submitText(text: string) {
    const trimmed = text.trim()
    if (!trimmed || sendMessage.isPending) return

    pushMessage({ id: nextId(), role: 'user', text: trimmed })
    setInput('')
    if (!navigator.onLine && walletId) {
      void enqueueChatMessage(walletId, trimmed)
        .then(() => {
          pushMessage({
            id: nextId(),
            role: 'assistant',
            text: 'Queued — sends when you’re back online.',
            queued: true,
          })
        })
        .catch(() => sendToAssistant(trimmed))
      return
    }
    sendToAssistant(trimmed)
  }

  function retry(message: ChatMessage) {
    if (!message.retryText || sendMessage.isPending) return
    sendToAssistant(message.retryText, message.id)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    submitText(input)
  }

  // Yes/Cancel on a staged edit or deletion. The change is applied server-side
  // only here — the model never had the power to do it itself.
  async function resolveAction(action: PendingAction, decision: 'confirm' | 'cancel') {
    if (actionStatus[action.id] || resolvingId) return
    setResolvingId(action.id)
    try {
      const res = await confirmAction.mutateAsync({ actionId: action.id, decision })
      setActionStatus((prev) => ({ ...prev, [action.id]: res.status }))
      const href =
        decision === 'confirm'
          ? viewHrefFor(res.domain, res.targetId ?? action.targetId)
          : undefined
      pushMessage({
        id: nextId(),
        role: 'assistant',
        text:
          decision === 'confirm'
            ? `Done — ${res.summary.replace(/\.$/, '')}.`
            : 'No worries — I left it as it was.',
        viewHref: href,
      })
    } catch (error) {
      pushMessage({
        id: nextId(),
        role: 'assistant',
        text: `I couldn't apply that: ${error instanceof Error ? error.message : 'something went wrong'}.`,
      })
    } finally {
      setResolvingId(null)
    }
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
      setRecordMode('locked')
      beginRecording()
    } else {
      finishRecording(false)
    }
  }

  // Drag-to-close on the top handle, iOS/Android bottom-sheet style. Only the
  // handle initiates a drag (not the header or message list) so it doesn't
  // fight with scrolling the conversation.
  const DRAG_CLOSE_THRESHOLD = 120
  const [dragY, setDragY] = useState(0)
  const draggingRef = useRef(false)
  const dragStartYRef = useRef(0)

  function onHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = true
    dragStartYRef.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onHandlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    setDragY(Math.max(0, e.clientY - dragStartYRef.current))
  }

  function onHandlePointerEnd() {
    if (!draggingRef.current) return
    draggingRef.current = false
    if (dragY > DRAG_CLOSE_THRESHOLD) onOpenChange(false)
    setDragY(0)
  }

  // Keep the latest message (or the "Thinking…" indicator) in view as the
  // conversation grows, rather than leaving new replies below the fold.
  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
  }, [messages, sendMessage.isPending])

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
        showCloseButton={false}
        // `data-[side=bottom]:h-[85svh]` matches the base sheet's own
        // `data-[side=bottom]:h-auto` in specificity (both are attribute-
        // scoped), so it actually overrides it — a plain `h-[85svh]` loses to
        // that attribute selector and the sheet grows unbounded with content.
        className="flex h-[85svh] flex-col gap-0 overflow-hidden rounded-t-[1.75rem] border-0 p-0 ring-0 data-[side=bottom]:h-[85svh] data-[side=bottom]:rounded-t-[1.75rem]"
        // Lift the sheet's contents clear of the on-screen keyboard so the input
        // and buttons stay visible while typing.
        style={keyboardInset ? { paddingBottom: keyboardInset } : undefined}
      >
        <div
          className="flex h-full flex-col"
          style={{
            transform: dragY ? `translateY(${dragY}px)` : undefined,
            transition: draggingRef.current ? 'none' : 'transform 200ms ease-out',
          }}
        >
          <div
            className="flex shrink-0 touch-none justify-center pt-3 pb-1"
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerEnd}
            onPointerCancel={onHandlePointerEnd}
          >
            <div className="h-1 w-10 rounded-full bg-border/70" />
          </div>

          <SheetHeader className="flex-row items-center justify-between px-5 pt-2 pb-1">
            <SheetTitle className="flex items-center gap-2">
              <PersonaAvatar value={persona.value} accent={persona.accent} size={28} />
              Chat with {persona.name}
            </SheetTitle>
            <SheetClose asChild>
              <Button variant="ghost" size="icon-sm">
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </Button>
            </SheetClose>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5">
            {messages.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Tell me about a purchase or payment — "spent {sym}12 on coffee at Blue Bottle", or
                  hold the mic to say it and release to send.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => submitText(prompt)}
                      className="rounded-full border border-border/60 bg-card px-3.5 py-2 text-xs font-medium text-foreground/80 shadow-[var(--shadow-soft)] transition-all hover:bg-[var(--iris-soft)]/60 active:scale-[0.98]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-3 pb-4">
              {messages.map((m) => (
                <div key={m.id} className="flex flex-col gap-2">
                  <div
                    className={
                      m.role === 'user'
                        ? 'ml-auto max-w-[80%] rounded-2xl rounded-br-xl bg-primary px-3.5 py-2.5 text-sm text-primary-foreground shadow-[var(--shadow-soft)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200'
                        : 'mr-auto max-w-[80%] rounded-2xl rounded-bl-xl bg-secondary px-3.5 py-2.5 text-sm shadow-[var(--shadow-soft)] ring-1 ring-border/40 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200'
                    }
                  >
                    <MessageBody text={m.text} />
                    {m.retryText && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        disabled={sendMessage.isPending}
                        onClick={() => retry(m)}
                      >
                        Retry
                      </Button>
                    )}
                    {m.viewHref && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => {
                          onOpenChange(false)
                          navigate(m.viewHref!)
                        }}
                      >
                        View
                      </Button>
                    )}
                  </div>
                  {m.pendingActions?.map((action) => (
                    <PendingActionCard
                      key={action.id}
                      action={action}
                      status={actionStatus[action.id]}
                      busy={resolvingId === action.id}
                      disabled={resolvingId !== null && resolvingId !== action.id}
                      onResolve={resolveAction}
                    />
                  ))}
                </div>
              ))}
              {sendMessage.isPending && (
                <div className="mr-auto flex max-w-[80%] items-center gap-2.5 rounded-2xl rounded-bl-xl bg-secondary px-3.5 py-2.5 text-sm text-muted-foreground shadow-[var(--shadow-soft)] ring-1 ring-border/40 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
                  {toolProgress ? (
                    <span>{toolProgress}</span>
                  ) : (
                    <>
                      <span className="sr-only">Thinking</span>
                      <span className="flex items-center gap-1" aria-hidden>
                        <span className="penda-typing-dot size-1.5 rounded-full bg-muted-foreground" />
                        <span className="penda-typing-dot size-1.5 rounded-full bg-muted-foreground" />
                        <span className="penda-typing-dot size-1.5 rounded-full bg-muted-foreground" />
                      </span>
                    </>
                  )}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="border-t border-border/50 bg-card/90 p-4 backdrop-blur-md">
            {statusText && (
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
                </span>
                {statusText}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isRecording ? 'Listening…' : `I spent ${sym}12 on coffee...`}
                autoComplete="off"
                className="h-12 rounded-2xl border-border/60 bg-secondary/40 shadow-[var(--shadow-soft)]"
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
                className={cn('size-12 shrink-0 touch-none rounded-2xl', isRecording && 'animate-pulse')}
                aria-label={isRecording ? 'Stop recording' : 'Hold to talk, or tap to record'}
                aria-pressed={isRecording}
              >
                <Mic className="size-4" />
              </Button>
              <Button type="submit" disabled={sendMessage.isPending} className="h-12 rounded-2xl px-4">
                Send
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function renderInline(text: string, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{part}</span>
    ),
  )
}

// Minimal markdown for the AI's replies — **bold** spans and "- "/"* " bullet
// lists — just enough to read naturally without pulling in a markdown library.
function MessageBody({ text }: { text: string }) {
  const blocks: React.ReactNode[] = []
  let listBuffer: string[] = []

  const flushList = () => {
    if (!listBuffer.length) return
    const items = listBuffer
    blocks.push(
      <ul key={`list-${blocks.length}`} className="list-disc space-y-0.5 pl-4">
        {items.map((item, i) => (
          <li key={i}>{renderInline(item, `li-${blocks.length}-${i}`)}</li>
        ))}
      </ul>,
    )
    listBuffer = []
  }

  text.split('\n').forEach((line, i) => {
    const bullet = line.match(/^[-*]\s+(.*)/)
    if (bullet) {
      listBuffer.push(bullet[1])
      return
    }
    flushList()
    if (line.trim()) blocks.push(<p key={`p-${i}`}>{renderInline(line, `p-${i}`)}</p>)
  })
  flushList()

  return <div className="space-y-1">{blocks}</div>
}

function PendingActionCard({
  action,
  status,
  busy,
  disabled,
  onResolve,
}: {
  action: PendingAction
  status: 'confirmed' | 'cancelled' | undefined
  busy: boolean
  disabled: boolean
  onResolve: (action: PendingAction, decision: 'confirm' | 'cancel') => void
}) {
  const destructive = action.kind === 'delete'

  return (
    <div className="mr-auto max-w-[85%] rounded-2xl border border-border/60 bg-card px-3.5 py-3 text-sm shadow-[var(--shadow-soft)]">
      <p className="text-card-foreground">{action.summary}</p>
      {status ? (
        <p
          className={cn(
            'mt-1.5 flex items-center gap-1 text-xs font-medium',
            status === 'confirmed' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
          )}
        >
          {status === 'confirmed' ? (
            <>
              <Check className="size-3.5" /> Applied
            </>
          ) : (
            <>
              <X className="size-3.5" /> Cancelled
            </>
          )}
        </p>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={destructive ? 'destructive' : 'default'}
            disabled={busy || disabled}
            onClick={() => onResolve(action, 'confirm')}
          >
            {busy ? 'Working…' : destructive ? 'Delete' : 'Confirm'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || disabled}
            onClick={() => onResolve(action, 'cancel')}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}
