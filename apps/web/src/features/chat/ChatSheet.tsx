import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Send, X } from 'lucide-react'
import { Camera, Microphone } from '@/components/icons/product'
import { toast } from 'sonner'
import { undoSoftDeletedTransaction } from '@/features/audit/api'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { currencySymbol } from '@/lib/currencies'
import { useKeyboardInset } from '@/lib/useKeyboardInset'
import { useCloseOnBack } from '@/lib/useCloseOnBack'
import { supabase } from '@/lib/supabase/client'
import { enqueueAiConfirm, enqueueChatMessage } from '@/pwa/offlineQueue'
import { useAuthStore } from '@/store/authStore'
import { useProfile } from '@/features/profile/hooks'
import { PersonaAvatar } from '@/features/profile/PersonaAvatar'
import { PERSONALITIES } from '@/features/profile/types'
import { useCategories } from '@/features/categories/hooks'
import { useEntitlement } from '@/features/entitlements/hooks'
import { PaywallSheet } from '@/features/entitlements/PaywallSheet'
import type { PremiumFeature } from '@/features/entitlements/types'
import { useUploadReceipt } from '@/features/receipts/hooks'
import { TransactionForm } from '@/features/transactions/TransactionForm'
import {
  useConfirmReceiptItems,
  useDeleteTransaction,
  useUpdateTransaction,
} from '@/features/transactions/hooks'
import type { ReceiptItemsConfirmInput, Transaction, TransactionInput } from '@/features/transactions/types'
import { sendChatMessageStream } from './api'
import { ActionTrail } from './ActionTrail'
import {
  finalizeLiveActions,
  mergeTrailActions,
  toolUi,
  viewHrefFor,
  withViewHrefs,
} from './actionMeta'
import { invalidateAfterChatResponse, useConfirmAiAction, useSendChatMessage } from './hooks'
import { useVoiceRecorder } from './useVoiceRecorder'
import type { PageContext } from './pageContext'
import type { ChatAction, ChatMessage, PendingAction } from './types'

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

const SUGGESTED_PROMPTS = [
  'What did I spend this week?',
  'How are my budgets doing?',
  'Always categorize Uber as Transport',
]

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
  /** In-flight tool steps for the current send (replaced by durable message.actions). */
  const [liveActions, setLiveActions] = useState<ChatAction[]>([])
  /** Assistant bubble currently receiving SSE tokens (null when idle). */
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const sentConversationIdRef = useRef(conversationId)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const streamAbortRef = useRef<AbortController | null>(null)
  // Keep a ref so the broadcast handler can merge without stale closures.
  const liveActionsRef = useRef<ChatAction[]>([])
  liveActionsRef.current = liveActions
  const queryClient = useQueryClient()

  // field-sizing:content shrinks width to the text; grow height manually instead.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`
  }, [input])

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
  const busy = sendMessage.isPending || streamingId !== null
  const session = useAuthStore((s) => s.session)
  const { data: profile } = useProfile(session?.user.id)
  const persona = PERSONALITIES.find((p) => p.value === profile?.ai_personality) ?? PERSONALITIES[0]
  const { isPremium, data: entitlement } = useEntitlement(session?.user.id)
  const canScanReceipt = isPremium || !entitlement?.receipt_scan_preview_used
  const { data: categories = [] } = useCategories(walletId)
  const uploadReceipt = useUploadReceipt(walletId)
  const updateTransaction = useUpdateTransaction(walletId)
  const deleteTransaction = useDeleteTransaction(walletId)
  const confirmReceiptItems = useConfirmReceiptItems(walletId)

  const [paywallFeature, setPaywallFeature] = useState<PremiumFeature | null>(null)
  const [receiptFormOpen, setReceiptFormOpen] = useState(false)
  const [receiptDraft, setReceiptDraft] = useState<Transaction | null>(null)
  const receiptInputRef = useRef<HTMLInputElement>(null)

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

  // Keep the tool-progress channel subscribed while the sheet is open, not
  // just while a send is in flight: joining only on isPending raced the
  // server — the WS join often hadn't completed when the first tool
  // broadcast fired, so early cues were silently missed.
  useEffect(() => {
    if (!open || !conversationId) return
    const channel = supabase.channel(`chat:${conversationId}`)
    channel
      .on('broadcast', { event: 'tool' }, ({ payload }) => {
        const tool = typeof payload?.tool === 'string' ? payload.tool : ''
        if (!tool) return
        const id =
          typeof payload?.id === 'string' && payload.id
            ? payload.id
            : `live-${tool}-${Date.now()}`
        const status =
          payload?.status === 'done' || payload?.status === 'error' || payload?.status === 'running'
            ? payload.status
            : 'running'
        const meta = toolUi(tool)
        const label = typeof payload?.label === 'string' && payload.label ? payload.label : meta.label
        const summary =
          typeof payload?.summary === 'string' && payload.summary
            ? payload.summary
            : status === 'running'
              ? meta.progress
              : meta.label

        setLiveActions((prev) => {
          const existing = prev.find((a) => a.id === id)
          if (existing) {
            return prev.map((a) =>
              a.id === id
                ? {
                    ...a,
                    status,
                    label,
                    summary: status === 'running' && !payload?.summary ? a.summary : summary,
                  }
                : a,
            )
          }
          // Legacy broadcast (tool name only): mark prior running steps done.
          const advanced = prev.map((a) =>
            a.status === 'running' ? { ...a, status: 'done' as const } : a,
          )
          return [
            ...advanced,
            {
              id,
              tool,
              domain: meta.domain,
              label,
              summary,
              status,
            },
          ]
        })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [open, conversationId])

  // Progress cues only mean something while a reply is in flight.
  useEffect(() => {
    if (!busy) setLiveActions([])
  }, [busy])

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort()
    }
  }, [])

  function applyChatResult(result: import('./types').ChatResponse, bubbleId: string, replaceId?: string) {
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
    const actions =
      result.actions && result.actions.length > 0
        ? withViewHrefs(result.actions)
        : finalizeLiveActions(liveActionsRef.current)
    const reply: ChatMessage = {
      id: bubbleId,
      role: 'assistant',
      text: result.reply,
      pendingActions: result.pendingActions?.length ? result.pendingActions : undefined,
      actions: actions.length > 0 ? actions : undefined,
      autoApplied: result.autoApplied || undefined,
    }
    replaceMessage(bubbleId, reply)
    // If we were retrying a different error bubble id, drop it.
    if (replaceId && replaceId !== bubbleId) {
      setMessages((prev) => prev.filter((m) => m.id !== replaceId))
    }
    invalidateAfterChatResponse(queryClient, walletId, result)
    if (result.autoApplied) {
      toast('Applied without asking — undo anytime in AI actions.')
    }
  }

  // SSE-first send; falls back to JSON invoke if the stream path fails before done.
  function sendToAssistant(text: string, replaceId?: string) {
    if (!walletId) return
    sentConversationIdRef.current = conversationId
    const bubbleId = replaceId ?? nextId()
    if (replaceId) {
      replaceMessage(replaceId, { id: bubbleId, role: 'assistant', text: '' })
    } else {
      pushMessage({ id: bubbleId, role: 'assistant', text: '' })
    }
    setStreamingId(bubbleId)

    streamAbortRef.current?.abort()
    const abort = new AbortController()
    streamAbortRef.current = abort
    let finished = false

    const fail = async (error: unknown) => {
      if (finished) return
      finished = true
      const networkFail =
        !navigator.onLine ||
        error instanceof TypeError ||
        (error instanceof Error && /fetch|network/i.test(error.message))
      if (networkFail && !replaceId) {
        try {
          await enqueueChatMessage(walletId, text)
          replaceMessage(bubbleId, {
            id: bubbleId,
            role: 'assistant',
            text: 'Queued — sends when you’re back online.',
            queued: true,
          })
          return
        } catch {
          /* fall through */
        }
      }
      // Stream failed — try classic JSON once.
      try {
        const result = await sendMessage.mutateAsync({ message: text, conversationId, pageContext })
        applyChatResult(result, bubbleId, replaceId)
      } catch (fallbackError) {
        replaceMessage(bubbleId, {
          id: bubbleId,
          role: 'assistant',
          text:
            fallbackError instanceof Error
              ? `Something went wrong: ${fallbackError.message}`
              : 'Something went wrong.',
          retryText: text,
        })
      }
    }

    void sendChatMessageStream(
      walletId,
      text,
      conversationId,
      pageContext,
      {
        onMeta: ({ conversationId: id }) => setConversationId(id),
        onToken: ({ text: delta }) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === bubbleId ? { ...m, text: m.text + delta } : m)),
          )
        },
        onReset: () => {
          setMessages((prev) => prev.map((m) => (m.id === bubbleId ? { ...m, text: '' } : m)))
        },
        onDone: (result) => {
          finished = true
          applyChatResult(result, bubbleId, replaceId)
        },
      },
      abort.signal,
    )
      .catch((error) => {
        if (abort.signal.aborted) return
        void fail(error)
      })
      .finally(() => {
        if (streamAbortRef.current === abort) streamAbortRef.current = null
        setStreamingId((id) => (id === bubbleId ? null : id))
      })
  }

  function submitText(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return

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
    if (!message.retryText || busy) return
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

    async function queueConfirm() {
      await enqueueAiConfirm(action.id, decision)
      setActionStatus((prev) => ({ ...prev, [action.id]: decision === 'confirm' ? 'confirmed' : 'cancelled' }))
      pushMessage({
        id: nextId(),
        role: 'assistant',
        text:
          decision === 'confirm'
            ? 'Queued — I’ll apply that when you’re back online.'
            : 'Queued cancel — I’ll drop that when you’re back online.',
        queued: true,
      })
    }

    if (!navigator.onLine) {
      try {
        await queueConfirm()
      } catch (error) {
        pushMessage({
          id: nextId(),
          role: 'assistant',
          text: `I couldn't queue that: ${error instanceof Error ? error.message : 'something went wrong'}.`,
        })
      } finally {
        setResolvingId(null)
      }
      return
    }

    try {
      const res = await confirmAction.mutateAsync({ actionId: action.id, decision })
      setActionStatus((prev) => ({ ...prev, [action.id]: res.status }))
      const targetId = res.targetId ?? action.targetId
      const canUndoDelete =
        decision === 'confirm' &&
        (res.kind ?? action.kind) === 'delete' &&
        res.domain === 'transaction' &&
        !!targetId
      pushMessage({
        id: nextId(),
        role: 'assistant',
        text:
          decision === 'confirm'
            ? `Done — ${res.summary.replace(/\.$/, '')}.`
            : 'No worries — I left it as it was.',
        viewHref:
          decision === 'confirm' ? viewHrefFor(res.domain, targetId) : undefined,
        undoTransactionId: canUndoDelete ? targetId : undefined,
        actions: decision === 'confirm'
          ? withViewHrefs([
              {
                id: nextId(),
                tool: action.kind === 'delete' ? 'delete_record' : 'update_record',
                domain: res.domain,
                label: action.kind === 'delete' ? 'Deleted' : 'Updated',
                summary: res.summary,
                status: 'done',
                targetId,
              },
            ])
          : undefined,
      })
    } catch (error) {
      const networkFail =
        !navigator.onLine ||
        error instanceof TypeError ||
        (error instanceof Error && /fetch|network/i.test(error.message))
      if (networkFail) {
        try {
          await queueConfirm()
          return
        } catch {
          /* fall through */
        }
      }
      pushMessage({
        id: nextId(),
        role: 'assistant',
        text: `I couldn't apply that: ${error instanceof Error ? error.message : 'something went wrong'}.`,
      })
    } finally {
      setResolvingId(null)
    }
  }

  async function undoFromChat(transactionId: string, messageId: string) {
    if (!session?.user.id) return
    try {
      await undoSoftDeletedTransaction(transactionId, session.user.id)
      toast('Transaction restored. AI confirmations are required again.')
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, undoTransactionId: undefined, text: `${m.text}\n\n(Undone.)` }
            : m,
        ),
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not undo.')
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
  function openReceiptPicker() {
    receiptInputRef.current?.click()
  }

  function openScanReceipt() {
    if (canScanReceipt) {
      openReceiptPicker()
      return
    }
    setPaywallFeature('receipt-scan')
  }

  async function handleReceiptSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const toastId = toast.loading('Scanning receipt…')
    try {
      const draft = await uploadReceipt.mutateAsync(file)
      toast.dismiss(toastId)
      setReceiptDraft(draft)
      setReceiptFormOpen(true)
    } catch (error) {
      toast.dismiss(toastId)
      toast.error(error instanceof Error ? error.message : 'Could not read that receipt.')
    }
  }

  async function confirmReceipt(input: TransactionInput) {
    if (!receiptDraft) return
    try {
      await updateTransaction.mutateAsync({
        id: receiptDraft.id,
        input,
        version: receiptDraft.version,
      })
      toast('Receipt confirmed.')
      setReceiptFormOpen(false)
      setReceiptDraft(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function confirmReceiptAsItems(input: ReceiptItemsConfirmInput) {
    if (!receiptDraft) return
    try {
      await confirmReceiptItems.mutateAsync({ draft: receiptDraft, input })
      toast(
        input.items.length === 1
          ? 'Receipt confirmed.'
          : `${input.items.length} items logged from receipt.`,
      )
      setReceiptFormOpen(false)
      setReceiptDraft(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
      throw error
    }
  }

  async function discardReceipt() {
    if (!receiptDraft) return
    try {
      await deleteTransaction.mutateAsync(receiptDraft.id)
      toast('Receipt discarded.')
      setReceiptFormOpen(false)
      setReceiptDraft(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

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
        size="page"
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0"
        // Lift the sheet's contents clear of the on-screen keyboard so the input
        // and buttons stay visible while typing.
        style={keyboardInset ? { paddingBottom: keyboardInset } : undefined}
      >
        <div
          className="mx-auto flex h-full w-full max-w-md flex-col"
          style={{
            transform: dragY ? `translateY(${dragY}px)` : undefined,
            transition: draggingRef.current ? 'none' : 'transform 200ms ease-out',
          }}
        >
          <div
            className="flex shrink-0 touch-none justify-center pt-[max(0.75rem,env(safe-area-inset-top))] pb-1"
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
                  </div>
                  {(() => {
                    const trail = mergeTrailActions(m.actions, m.pendingActions, actionStatus)
                    const showAudit =
                      trail.length > 0 || m.autoApplied || m.undoTransactionId || m.viewHref
                    if (!showAudit) return null
                    return (
                      <ActionTrail
                        actions={trail}
                        onNavigateAway={() => onOpenChange(false)}
                        busyActionId={resolvingId}
                        resolveDisabled={resolvingId !== null}
                        onResolvePending={resolveAction}
                        footer={
                          <>
                            {m.viewHref && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-xs"
                                onClick={() => {
                                  onOpenChange(false)
                                  navigate(m.viewHref!)
                                }}
                              >
                                View
                              </Button>
                            )}
                            {m.undoTransactionId && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-xs"
                                onClick={() => void undoFromChat(m.undoTransactionId!, m.id)}
                              >
                                Undo
                              </Button>
                            )}
                            {(trail.length > 0 || m.autoApplied) && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2.5 text-xs text-muted-foreground"
                                onClick={() => {
                                  onOpenChange(false)
                                  navigate('/ai-actions')
                                }}
                              >
                                AI actions
                              </Button>
                            )}
                          </>
                        }
                      />
                    )
                  })()}
                </div>
              ))}
              {sendMessage.isPending &&
                (liveActions.length > 0 ? (
                  <ActionTrail
                    actions={liveActions}
                    className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
                  />
                ) : (
                  <div className="mr-auto flex max-w-[80%] items-center gap-2.5 rounded-2xl rounded-bl-xl bg-secondary px-3.5 py-2.5 text-sm text-muted-foreground shadow-[var(--shadow-soft)] ring-1 ring-border/40 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
                    <span className="sr-only">Thinking</span>
                    <span className="flex items-center gap-1" aria-hidden>
                      <span className="penda-typing-dot size-1.5 rounded-full bg-muted-foreground" />
                      <span className="penda-typing-dot size-1.5 rounded-full bg-muted-foreground" />
                      <span className="penda-typing-dot size-1.5 rounded-full bg-muted-foreground" />
                    </span>
                  </div>
                ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-border/50 bg-background/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md"
          >
            {statusText && (
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
                </span>
                {statusText}
              </div>
            )}
            <div className="flex w-full items-end gap-1 rounded-2xl border border-border/60 bg-secondary/40 p-1.5 shadow-[var(--shadow-soft)] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || e.shiftKey) return
                  e.preventDefault()
                  if (sendMessage.isPending || !input.trim()) return
                  submitText(input)
                }}
                placeholder={isRecording ? 'Listening…' : `I spent ${sym}12 on coffee...`}
                autoComplete="off"
                rows={1}
                className="max-h-36 min-h-10 min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2.5 py-2.5 shadow-none [field-sizing:fixed] focus-visible:border-transparent focus-visible:ring-0"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={uploadReceipt.isPending || voice.state === 'transcribing' || isRecording}
                onClick={openScanReceipt}
                className="size-10 shrink-0 self-end rounded-xl"
                aria-label="Scan receipt"
              >
                <Camera className="size-4" weight="fill" />
              </Button>
              <Button
                type="button"
                variant={isRecording ? 'destructive' : 'ghost'}
                size="icon"
                disabled={voice.state === 'transcribing' || uploadReceipt.isPending}
                onPointerDown={onMicPointerDown}
                onPointerUp={onMicPointerUp}
                onPointerCancel={onMicPointerCancel}
                onContextMenu={(e) => e.preventDefault()}
                onClick={onMicClick}
                className={cn('size-10 shrink-0 touch-none self-end rounded-xl', isRecording && 'animate-pulse')}
                aria-label={isRecording ? 'Stop recording' : 'Hold to talk, or tap to record'}
                aria-pressed={isRecording}
              >
                <Microphone className="size-4" weight="fill" />
              </Button>
              <Button
                type="submit"
                size="icon"
                disabled={sendMessage.isPending || !input.trim() || uploadReceipt.isPending}
                className="size-10 shrink-0 self-end rounded-xl"
                aria-label="Send"
              >
                <Send className="size-4" />
              </Button>
            </div>
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleReceiptSelected}
            />
          </form>

          <PaywallSheet
            feature={paywallFeature}
            onOpenChange={(open) => !open && setPaywallFeature(null)}
            onPreviewOnce={openReceiptPicker}
          />

          <TransactionForm
            open={receiptFormOpen}
            onOpenChange={(open) => {
              setReceiptFormOpen(open)
              if (!open) setReceiptDraft(null)
            }}
            categories={categories}
            currency={currency}
            walletId={walletId}
            transaction={receiptDraft}
            onSubmit={confirmReceipt}
            onConfirmItems={confirmReceiptAsItems}
            onDelete={receiptDraft ? discardReceipt : undefined}
            isSubmitting={
              updateTransaction.isPending ||
              deleteTransaction.isPending ||
              confirmReceiptItems.isPending
            }
          />
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

