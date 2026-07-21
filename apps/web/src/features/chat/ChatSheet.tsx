import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Maximize2, Send, X } from 'lucide-react'
import { Camera, Microphone } from '@/components/icons/product'
import { toast } from 'sonner'
import {
  fetchAiPendingAction,
  softDeleteCreatedTransaction,
  undoAiAction,
  undoCreatedEntity,
  undoSoftDeletedTransaction,
} from '@/features/audit/api'
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
import { AiSettingsSheet } from '@/features/profile/AiSettingsSheet'
import { PersonaAvatar } from '@/features/profile/PersonaAvatar'
import { personalityMeta } from '@/features/profile/types'
import { useCategories } from '@/features/categories/hooks'
import { useEntitlement } from '@/features/entitlements/hooks'
import { PaywallSheet } from '@/features/entitlements/PaywallSheet'
import type { PremiumFeature } from '@/features/entitlements/types'
import { useUploadReceipt } from '@/features/receipts/hooks'
import { BudgetForm } from '@/features/budgets/BudgetForm'
import { useDeleteBudget, useUpdateBudget } from '@/features/budgets/hooks'
import type { Budget, BudgetInput } from '@/features/budgets/types'
import { DebtForm } from '@/features/debts/DebtForm'
import { useDeleteDebt, useUpdateDebt } from '@/features/debts/hooks'
import type { Debt, DebtInput } from '@/features/debts/types'
import { GoalForm } from '@/features/goals/GoalForm'
import { useDeleteSavingsGoal, useUpdateSavingsGoal } from '@/features/goals/hooks'
import type { SavingsGoal, SavingsGoalInput } from '@/features/goals/types'
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
  listHrefFor,
  listLabelFor,
  viewHrefFor,
  withViewHrefs,
} from './actionMeta'
import type { ChatMode } from './chatStore'
import { invalidateAfterChatResponse, useConfirmAiAction, useSendChatMessage } from './hooks'
import { suggestedPromptsFor } from './suggestedPrompts'
import { useVoiceRecorder } from './useVoiceRecorder'
import type { PageContext } from './pageContext'
import { resolveUndoTargets } from './chatUndo'
import type { ChatAction, ChatMessage, ChatUndoTarget, PendingAction } from './types'
import {
  isInChatViewKind,
  parseViewHref,
  pendaOpenStateFromHref,
  prefetchViewHref,
  resolveViewEntity,
} from './viewNavigation'
import { useMemories } from '@/features/memory/hooks'
import { usePacts } from '@/features/pacts/hooks'
import { buildContinuityOpener } from '@/features/companion/continuity'
import { dueDeferredQuestions, parseBusySignal } from '@/features/companion/deferredQuestions'
import { EMPTY_DEFERRED, useDeferredStore } from '@/features/companion/deferredStore'
import { DeferredQuestionBanner } from '@/features/companion/DeferredQuestionBanner'
import {
  assistantAskedQuestion,
  shouldContinueListening,
} from '@/features/companion/voiceConversation'
import { DEFAULT_COMPANION_PREFS } from '@/features/companion/companionPrefs'

interface ChatSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  walletId: string | undefined
  initialInput?: string
  /** Send `initialInput` immediately on open so Penda replies first. */
  autoSend?: boolean
  /** Called once the auto-send has fired, so the caller can clear the flag. */
  onAutoSendConsumed?: () => void
  mode?: ChatMode
  onModeChange?: (mode: ChatMode) => void
  /** Begin hold-style listening when the sheet opens (home mic → chat). */
  startRecording?: boolean
  onStartRecordingConsumed?: () => void
  /** When bumped, clear the local thread and start a fresh conversation id. */
  newTopicNonce?: number
  onNewTopic?: () => void
  currency?: string
  pageContext?: PageContext
  /** Zero-history wallet: setup-oriented empty prompts and copy. */
  isFirstRun?: boolean
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

export function ChatSheet({
  open,
  onOpenChange,
  walletId,
  initialInput,
  autoSend = false,
  onAutoSendConsumed,
  mode = 'full',
  onModeChange,
  startRecording = false,
  onStartRecordingConsumed,
  newTopicNonce = 0,
  onNewTopic,
  currency = 'USD',
  pageContext,
  isFirstRun = false,
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

  // Persist across app reloads, restored above via loadStoredChat's lazy init.
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
      // Storage full or unavailable (e.g. private browsing), history just won't persist.
    }
  }, [walletId, messages, conversationId, actionStatus])
  const sendMessage = useSendChatMessage(walletId)
  const confirmAction = useConfirmAiAction(walletId)
  const busy = sendMessage.isPending || streamingId !== null
  const session = useAuthStore((s) => s.session)
  const { data: profile } = useProfile(session?.user.id)
  const persona = personalityMeta(profile?.ai_personality)
  const { data: memories = [] } = useMemories(session?.user.id)
  const { data: pacts = [] } = usePacts(walletId)
  const deferredList = useDeferredStore((s) =>
    walletId ? (s.byWallet[walletId] ?? EMPTY_DEFERRED) : EMPTY_DEFERRED,
  )
  const enqueueDeferred = useDeferredStore((s) => s.enqueue)
  const markDeferredAsked = useDeferredStore((s) => s.markAsked)
  const markDeferredDismissed = useDeferredStore((s) => s.markDismissed)
  const dueDeferred = dueDeferredQuestions(deferredList)
  const { isPremium, data: entitlement } = useEntitlement(session?.user.id)
  const canScanReceipt = isPremium || !entitlement?.receipt_scan_preview_used
  const { data: categories = [] } = useCategories(walletId)
  const voiceTurnRef = useRef(false)
  const continuityInjectedRef = useRef(false)
  const uploadReceipt = useUploadReceipt(walletId)
  const updateTransaction = useUpdateTransaction(walletId)
  const deleteTransaction = useDeleteTransaction(walletId)
  const confirmReceiptItems = useConfirmReceiptItems(walletId)
  const updateBudget = useUpdateBudget(walletId)
  const deleteBudget = useDeleteBudget(walletId)
  const updateDebt = useUpdateDebt(walletId)
  const deleteDebt = useDeleteDebt(walletId)
  const updateGoal = useUpdateSavingsGoal(walletId)
  const deleteGoal = useDeleteSavingsGoal(walletId)

  const [paywallFeature, setPaywallFeature] = useState<PremiumFeature | null>(null)
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false)
  /** Shared transaction sheet: receipt drafts and View-from-chat edits. */
  const [overlayTx, setOverlayTx] = useState<Transaction | null>(null)
  const [overlayBudget, setOverlayBudget] = useState<Budget | null>(null)
  const [overlayDebt, setOverlayDebt] = useState<Debt | null>(null)
  const [overlayGoal, setOverlayGoal] = useState<SavingsGoal | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const receiptInputRef = useRef<HTMLInputElement>(null)

  const keyboardInset = useKeyboardInset()
  const { prepareNavigateAway } = useCloseOnBack(open, () => onOpenChange(false))
  const [instantDismiss, setInstantDismiss] = useState(false)

  const isReceiptOverlay =
    !!overlayTx && overlayTx.source === 'receipt' && !overlayTx.user_confirmed

  function clearEntityOverlays() {
    setOverlayTx(null)
    setOverlayBudget(null)
    setOverlayDebt(null)
    setOverlayGoal(null)
  }

  useEffect(() => {
    if (open) setInstantDismiss(false)
    else {
      setAiSettingsOpen(false)
      clearEntityOverlays()
    }
  }, [open])

  /** Navigate first, then drop chat without exit animation / history race. */
  function navigateAway(href: string) {
    prepareNavigateAway()
    setInstantDismiss(true)
    prefetchViewHref(queryClient, walletId, href)
    const state = pendaOpenStateFromHref(href)
    navigate(href, { replace: true, state })
    onOpenChange(false)
  }

  function warmViewHref(href: string) {
    prefetchViewHref(queryClient, walletId, href)
  }

  /** Open any entity detail sheet on top of chat; hub-only links still navigate. */
  async function openView(href: string) {
    const { kind, id } = parseViewHref(href)
    if (!isInChatViewKind(kind) || !id || !walletId) {
      navigateAway(href)
      return
    }

    setViewLoading(true)
    try {
      const entity = await resolveViewEntity(queryClient, walletId, kind, id)
      if (!entity) {
        toast.error('Could not find that item.')
        return
      }
      clearEntityOverlays()
      if (kind === 'transaction') setOverlayTx(entity as Transaction)
      else if (kind === 'budget') setOverlayBudget(entity as Budget)
      else if (kind === 'debt') setOverlayDebt(entity as Debt)
      else setOverlayGoal(entity as SavingsGoal)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open that item.')
    } finally {
      setViewLoading(false)
    }
  }

  /** Close the in-chat sheet and go to the entity's full page. */
  function openInApp(href: string) {
    clearEntityOverlays()
    navigateAway(href)
  }

  // Warm destination caches while the View button is on screen.
  useEffect(() => {
    if (!open || !walletId) return
    for (const m of messages) {
      if (m.viewHref) prefetchViewHref(queryClient, walletId, m.viewHref)
      for (const a of m.actions ?? []) {
        if (a.viewHref) prefetchViewHref(queryClient, walletId, a.viewHref)
      }
    }
  }, [open, walletId, messages, queryClient])

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
      continuityInjectedRef.current = false
      return
    }
    if (!initialInput) return
    if (autoSend && !autoSentRef.current) {
      autoSentRef.current = true
      onAutoSendConsumed?.()
      submitText(initialInput)
      return
    }
    // Prefill only when not auto-sending. After auto-send, consumeAutoSend flips
    // autoSend→false while prefill may still be set; don't re-fill the input.
    if (!autoSend && !autoSentRef.current) {
      setInput(initialInput)
    }
    // submitText is a stable closure over state we intentionally read at fire time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialInput, autoSend])

  const voice = useVoiceRecorder({
    onError: (message) => {
      setRecordMode('idle')
      toast.error(message)
    },
  })

  // Home mic (and similar) open chat already listening, tap mic again to stop.
  useEffect(() => {
    if (!open || !startRecording) return
    onStartRecordingConsumed?.()
    baseInputRef.current = input
    setRecordMode('locked')
    voiceTurnRef.current = true
    void voice.start().catch(() => setRecordMode('idle'))
    // Only react to the startRecording flag when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startRecording])

  // Cross-session continuity: when the sheet opens empty after a gap, seed a
  // local assistant opener grounded in memory / active pacts.
  useEffect(() => {
    if (!open || continuityInjectedRef.current || messages.length > 0 || autoSend || initialInput) {
      return
    }
    const prefs = profile?.companion_prefs ?? DEFAULT_COMPANION_PREFS
    if (!prefs.continuity_openers) {
      continuityInjectedRef.current = true
      return
    }

    const lastKey = walletId ? `penda:chat-last-open:${walletId}` : null
    let daysSince: number | null = null
    if (lastKey) {
      const raw = localStorage.getItem(lastKey)
      if (raw) {
        const prev = Date.parse(raw)
        if (Number.isFinite(prev)) {
          daysSince = Math.floor((Date.now() - prev) / 86_400_000)
        }
      }
      localStorage.setItem(lastKey, new Date().toISOString())
    }

    const today = new Date().toISOString().slice(0, 10)
    const opener = buildContinuityOpener({
      memories,
      activePacts: pacts
        .filter((p) => p.end_date >= today)
        .map((p) => ({ description: p.description, end_date: p.end_date })),
      personaName: persona.name,
      daysSinceLastOpen: daysSince,
      enabled: true,
    })
    continuityInjectedRef.current = true
    if (!opener) return
    setMessages((prev) =>
      prev.length > 0 ? prev : [...prev, { id: nextId(), role: 'assistant', text: opener }],
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoSend, initialInput, walletId])

  // "New topic" clears the local thread so the relationship can reset without
  // losing the ambient sheet mount.
  const lastTopicNonce = useRef(newTopicNonce)
  useEffect(() => {
    if (newTopicNonce === lastTopicNonce.current) return
    lastTopicNonce.current = newTopicNonce
    streamAbortRef.current?.abort()
    setMessages([])
    setConversationId(undefined)
    sentConversationIdRef.current = undefined
    setActionStatus({})
    setLiveActions([])
    setStreamingId(null)
    setInput('')
  }, [newTopicNonce])

  // Multi-step tool work needs the full surface, promote quick → full.
  useEffect(() => {
    if (mode !== 'quick') return
    const hasPending = messages.some((m) =>
      (m.pendingActions ?? []).some((a) => !actionStatus[a.id]),
    )
    if (hasPending || liveActions.length > 0) onModeChange?.('full')
  }, [mode, messages, actionStatus, liveActions, onModeChange])

  const emptyPrompts = suggestedPromptsFor(pageContext, currency, { isFirstRun })

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
  // server, the WS join often hadn't completed when the first tool
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

  function applyChatResult(result: import('./types').ChatResponse, bubbleId: string) {
    const rotated =
      !!sentConversationIdRef.current && sentConversationIdRef.current !== result.conversationId
    setConversationId(result.conversationId)
    if (rotated) {
      pushMessage({
        id: nextId(),
        role: 'assistant',
        text: '(new session)',
      })
    }
    const actions =
      result.actions && result.actions.length > 0
        ? withViewHrefs(result.actions)
        : finalizeLiveActions(liveActionsRef.current)
    const undoTargets = resolveUndoTargets({ actions })
    const primaryViewHref = actions.find((a) => a.viewHref)?.viewHref
    const reply: ChatMessage = {
      id: bubbleId,
      role: 'assistant',
      text: result.reply,
      pendingActions: result.pendingActions?.length ? result.pendingActions : undefined,
      actions: actions.length > 0 ? actions : undefined,
      undoTargets: undoTargets.length > 0 ? undoTargets : undefined,
      autoApplied: result.autoApplied || undefined,
      viewHref: primaryViewHref,
    }
    replaceMessage(bubbleId, reply)
    invalidateAfterChatResponse(queryClient, walletId, result)
    // Completion lives in the ActionTrail (Undo / AI actions), no toast divert.

    // Multi-turn voice: keep listening after a voice turn so conversation continues.
    const hasPending = (result.pendingActions ?? []).some((a) => !actionStatus[a.id])
    if (
      shouldContinueListening({
        voiceConversationEnabled: true,
        wasVoiceTurn: voiceTurnRef.current,
        hasPendingConfirm: hasPending,
        assistantAskedQuestion: assistantAskedQuestion(result.reply),
      })
    ) {
      window.setTimeout(() => {
        if (!open) return
        baseInputRef.current = ''
        setRecordMode('locked')
        void voice.start().catch(() => setRecordMode('idle'))
      }, 400)
    } else {
      voiceTurnRef.current = false
    }

    // Stash clarifying questions the model deferred ("I'll ask later: …").
    const deferMatch = /I'll ask later:\s*(.+)$/im.exec(result.reply)
    if (deferMatch?.[1] && walletId) {
      enqueueDeferred(walletId, deferMatch[1].trim(), { askAfterMs: 2 * 60_000 })
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
            text: "Queued. Sends when you're back online.",
            queued: true,
          })
          return
        } catch {
          /* fall through */
        }
      }
      // Stream failed, try classic JSON once.
      try {
        const result = await sendMessage.mutateAsync({ message: text, conversationId, pageContext })
        applyChatResult(result, bubbleId)
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
          applyChatResult(result, bubbleId)
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

  function submitText(text: string, opts?: { fromVoice?: boolean }) {
    const trimmed = text.trim()
    if (!trimmed || busy) return

    if (opts?.fromVoice) voiceTurnRef.current = true

    // If the user signals they're busy, stash any pending deferred asks further out.
    if (parseBusySignal(trimmed) && walletId && dueDeferred[0]) {
      enqueueDeferred(walletId, dueDeferred[0].question, { askAfterMs: 30 * 60_000 })
      markDeferredDismissed(walletId, dueDeferred[0].id)
    }

    pushMessage({ id: nextId(), role: 'user', text: trimmed })
    setInput('')
    if (!navigator.onLine && walletId) {
      void enqueueChatMessage(walletId, trimmed)
        .then(() => {
          pushMessage({
            id: nextId(),
            role: 'assistant',
            text: "Queued. Sends when you're back online.",
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
  // only here, the model never had the power to do it itself.
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
            ? "Queued. I'll apply that when you're back online."
            : "Queued cancel. I'll drop that when you're back online.",
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
      const confirmedActions =
        decision === 'confirm'
          ? withViewHrefs([
              {
                // Keep the pending-action id so Undo can call undoAiAction.
                id: action.id,
                tool: action.kind === 'delete' ? 'delete_record' : 'update_record',
                domain: res.domain,
                label: action.kind === 'delete' ? 'Deleted' : 'Updated',
                summary: res.summary,
                status: 'done' as const,
                targetId,
              },
            ])
          : undefined
      const undoTargets =
        decision === 'confirm' ? resolveUndoTargets({ actions: confirmedActions }) : []
      pushMessage({
        id: nextId(),
        role: 'assistant',
        text:
          decision === 'confirm'
            ? `Done. ${res.summary.replace(/\.$/, '')}.`
            : 'No worries. I left it as it was.',
        viewHref:
          decision === 'confirm' ? viewHrefFor(res.domain, targetId) : undefined,
        undoTargets: undoTargets.length > 0 ? undoTargets : undefined,
        actions: confirmedActions,
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

  async function undoTarget(target: ChatUndoTarget, userId: string): Promise<void> {
    switch (target.type) {
      case 'pending_action': {
        const action = await fetchAiPendingAction(target.actionId)
        if (!action) throw new Error('That change is no longer available to undo.')
        await undoAiAction(action, userId)
        return
      }
      case 'soft_delete_transaction':
        await softDeleteCreatedTransaction(target.transactionId, userId)
        return
      case 'restore_soft_deleted_transaction':
        await undoSoftDeletedTransaction(target.transactionId, userId)
        return
      case 'delete_created':
        await undoCreatedEntity(target.domain, target.targetId, userId)
        return
    }
  }

  async function undoFromChat(targets: ChatUndoTarget[], messageId: string) {
    if (!session?.user.id || targets.length === 0) return
    try {
      for (const target of targets) {
        await undoTarget(target, session.user.id)
      }
      toast('Undone. AI confirmations are required again.')
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                undoTransactionId: undefined,
                undoTargets: undefined,
                text: `${m.text}\n\n(Undone.)`,
              }
            : m,
        ),
      )
      const userId = session.user.id
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['budgets'] })
      void queryClient.invalidateQueries({ queryKey: ['savings-goals'] })
      void queryClient.invalidateQueries({ queryKey: ['debts'] })
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
      void queryClient.invalidateQueries({ queryKey: ['ai-pending-actions', userId] })
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] })
      void queryClient.invalidateQueries({ queryKey: ['insights', walletId] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not undo.')
    }
  }

  // Merge the just-finished recording's final transcript with whatever the user
  // had typed beforehand.
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
    if (submit) submitText(combined, { fromVoice: true })
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
      setOverlayTx(draft)
    } catch (error) {
      toast.dismiss(toastId)
      toast.error(error instanceof Error ? error.message : 'Could not read that receipt.')
    }
  }

  async function saveOverlayTransaction(input: TransactionInput) {
    if (!overlayTx) return
    try {
      await updateTransaction.mutateAsync({
        id: overlayTx.id,
        input,
        version: overlayTx.version,
      })
      toast(isReceiptOverlay ? 'Receipt confirmed.' : 'Transaction updated.')
      setOverlayTx(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function confirmReceiptAsItems(input: ReceiptItemsConfirmInput) {
    if (!overlayTx) return
    try {
      await confirmReceiptItems.mutateAsync({ draft: overlayTx, input })
      toast(
        input.items.length === 1
          ? 'Receipt confirmed.'
          : `${input.items.length} items logged from receipt.`,
      )
      setOverlayTx(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
      throw error
    }
  }

  async function deleteOverlayTransaction() {
    if (!overlayTx) return
    try {
      await deleteTransaction.mutateAsync(overlayTx.id)
      toast(isReceiptOverlay ? 'Receipt discarded.' : 'Transaction deleted.')
      setOverlayTx(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function saveOverlayBudget(input: BudgetInput) {
    if (!overlayBudget) return
    try {
      await updateBudget.mutateAsync({ id: overlayBudget.id, input })
      toast('Budget updated.')
      setOverlayBudget(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function deleteOverlayBudget() {
    if (!overlayBudget) return
    try {
      await deleteBudget.mutateAsync(overlayBudget.id)
      toast('Budget deleted.')
      setOverlayBudget(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function saveOverlayDebt(input: DebtInput) {
    if (!overlayDebt) return
    try {
      await updateDebt.mutateAsync({ id: overlayDebt.id, input })
      toast('Debt updated.')
      setOverlayDebt(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function deleteOverlayDebt() {
    if (!overlayDebt) return
    try {
      await deleteDebt.mutateAsync(overlayDebt.id)
      toast('Debt deleted.')
      setOverlayDebt(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function saveOverlayGoal(input: SavingsGoalInput, _initialAmountMinor: number) {
    if (!overlayGoal) return
    try {
      await updateGoal.mutateAsync({ id: overlayGoal.id, input })
      toast('Goal updated.')
      setOverlayGoal(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function deleteOverlayGoal() {
    if (!overlayGoal) return
    try {
      await deleteGoal.mutateAsync(overlayGoal.id)
      toast('Goal deleted.')
      setOverlayGoal(null)
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
  // conversation grows, and jump to the bottom whenever the sheet opens with
  // an existing thread (messages alone don't change on reopen).
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    const justOpened = !wasOpenRef.current
    wasOpenRef.current = true
    // Instant on open so history lands on the latest turn; smooth while chatting.
    const behavior: ScrollBehavior = justOpened ? 'auto' : 'smooth'

    const scrollToLatest = () => {
      const scroller = messagesScrollRef.current
      if (scroller) {
        if (typeof scroller.scrollTo === 'function') {
          scroller.scrollTo({ top: scroller.scrollHeight, behavior })
        } else {
          scroller.scrollTop = scroller.scrollHeight
        }
        return
      }
      messagesEndRef.current?.scrollIntoView?.({ behavior, block: 'end' })
    }

    // Sheet content mounts after `open`; wait a frame so scrollHeight is correct.
    const frame = requestAnimationFrame(() => {
      scrollToLatest()
      if (justOpened) requestAnimationFrame(scrollToLatest)
    })
    return () => cancelAnimationFrame(frame)
  }, [open, messages, busy])

  const streamingMessage = streamingId ? messages.find((m) => m.id === streamingId) : undefined
  const awaitingFirstToken = busy && (!streamingId || streamingMessage?.text === '')

  const isRecording = recordMode !== 'idle'
  const statusText =
    voice.state === 'transcribing'
      ? 'Transcribing…'
      : recordMode === 'holding'
        ? 'Listening. Release to send'
        : recordMode === 'locked'
          ? 'Listening. Tap the mic to stop'
          : null

  const isQuick = mode === 'quick'

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          size={isQuick ? 'half' : 'page'}
          showCloseButton={false}
          instantDismiss={instantDismiss}
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
            className={cn(
              'flex shrink-0 touch-none justify-center pb-1',
              isQuick ? 'pt-3' : 'pt-[max(0.75rem,env(safe-area-inset-top))]',
            )}
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerEnd}
            onPointerCancel={onHandlePointerEnd}
          >
            <div className="h-1 w-10 rounded-full bg-border/70" />
          </div>

          <SheetHeader className="flex-row items-center justify-between gap-2 px-5 pt-2 pb-1">
            {isQuick ? (
              <SheetTitle className="flex min-w-0 items-center gap-2">
                <PersonaAvatar value={persona.value} accent={persona.accent} size={28} />
                <span className="truncate">Quick log</span>
              </SheetTitle>
            ) : (
              <>
                <SheetTitle className="sr-only">Chat with {persona.name}</SheetTitle>
                <button
                  type="button"
                  onClick={() => setAiSettingsOpen(true)}
                  className="flex min-w-0 items-center gap-1.5 rounded-lg py-0.5 pr-1 text-left transition-opacity hover:opacity-80 active:opacity-70"
                  aria-label={`${persona.name}, AI settings`}
                >
                  <PersonaAvatar value={persona.value} accent={persona.accent} size={28} />
                  <span className="truncate font-heading text-base font-semibold text-foreground">
                    {persona.name}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </>
            )}
            <div className="flex shrink-0 items-center gap-0.5">
              {!isQuick && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground"
                  onClick={() => navigateAway('/journal')}
                >
                  Memory
                </Button>
              )}
              {messages.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground"
                  onClick={() => onNewTopic?.()}
                >
                  New topic
                </Button>
              )}
              {isQuick && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onModeChange?.('full')}
                  aria-label="Expand chat"
                >
                  <Maximize2 className="size-4" />
                </Button>
              )}
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="text-muted-foreground"
                  aria-label="Close chat"
                >
                  <X className="size-5" />
                  <span className="sr-only">Close</span>
                </Button>
              </SheetClose>
            </div>
          </SheetHeader>

          {dueDeferred[0] && walletId && !busy && (
            <DeferredQuestionBanner
              question={dueDeferred[0]}
              onAsk={() => {
                const q = dueDeferred[0]!
                markDeferredAsked(walletId, q.id)
                submitText(q.question)
              }}
              onDismiss={() => markDeferredDismissed(walletId, dueDeferred[0]!.id)}
            />
          )}

          <div ref={messagesScrollRef} className="flex-1 overflow-y-auto px-5">
            {messages.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {isFirstRun
                    ? isQuick
                      ? `Let's log your first purchase. Try "spent ${sym}12 on coffee", or tell me your balance.`
                      : `Your wallet is new. Log a purchase, share your balance, or ask me to set a simple budget.`
                    : isQuick
                      ? `Say or type a purchase like "spent ${sym}12 on coffee" and I'll log it.`
                      : pageContext?.page && pageContext.page !== 'home'
                        ? `Ask me anything about this screen, or hold the mic to talk.`
                        : `Tell me about a purchase or payment like "spent ${sym}12 on coffee", or hold the mic to say it.`}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {emptyPrompts.map((prompt) => (
                    <button
                      key={prompt.label}
                      type="button"
                      onClick={() => {
                        if (prompt.autoSend === false) {
                          setInput(prompt.label)
                          inputRef.current?.focus()
                          return
                        }
                        submitText(prompt.label)
                      }}
                      className="rounded-full border border-border/60 bg-card px-3.5 py-2 text-xs font-medium text-foreground/80 shadow-[var(--shadow-soft)] transition-all hover:bg-[var(--iris-soft)]/60 active:scale-[0.98]"
                    >
                      {prompt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-3 pb-4">
              {messages.map((m) => {
                // Waiting on the first token/action for this bubble: the
                // Thinking indicator below covers this slot instead.
                if (m.id === streamingId && m.text === '' && liveActions.length === 0) return null
                return (
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
                          disabled={busy}
                          onClick={() => retry(m)}
                        >
                          Retry
                        </Button>
                      )}
                    </div>
                    {(() => {
                      const trail = mergeTrailActions(m.actions, m.pendingActions, actionStatus)
                      const undoTargets = resolveUndoTargets(m)
                      const showAudit =
                        trail.length > 0 ||
                        m.autoApplied ||
                        undoTargets.length > 0 ||
                        m.viewHref
                      if (!showAudit) return null
                      return (
                        <ActionTrail
                          actions={trail}
                          onNavigateAway={navigateAway}
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
                                  disabled={viewLoading}
                                  onPointerDown={() => warmViewHref(m.viewHref!)}
                                  onClick={() => void openView(m.viewHref!)}
                                >
                                  View
                                </Button>
                              )}
                              {undoTargets.length > 0 && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2.5 text-xs"
                                  onClick={() => void undoFromChat(undoTargets, m.id)}
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
                                  onClick={() => navigateAway('/ai-actions')}
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
                )
              })}
              {busy && liveActions.length > 0 && (
                <ActionTrail
                  actions={liveActions}
                  className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
                />
              )}
              {awaitingFirstToken && liveActions.length === 0 && (
                <div className="mr-auto flex max-w-[80%] items-center gap-2.5 rounded-2xl rounded-bl-xl bg-secondary px-3.5 py-2.5 text-sm text-muted-foreground shadow-[var(--shadow-soft)] ring-1 ring-border/40 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
                  <span className="sr-only">Thinking</span>
                  <span className="flex items-center gap-1" aria-hidden>
                    <span className="penda-typing-dot size-1.5 rounded-full bg-muted-foreground" />
                    <span className="penda-typing-dot size-1.5 rounded-full bg-muted-foreground" />
                    <span className="penda-typing-dot size-1.5 rounded-full bg-muted-foreground" />
                  </span>
                </div>
              )}
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
                  if (busy || !input.trim()) return
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
                disabled={busy || !input.trim() || uploadReceipt.isPending}
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
            open={!!overlayTx}
            onOpenChange={(next) => {
              if (!next) setOverlayTx(null)
            }}
            categories={categories}
            currency={currency}
            walletId={walletId}
            transaction={overlayTx}
            onSubmit={saveOverlayTransaction}
            onConfirmItems={isReceiptOverlay ? confirmReceiptAsItems : undefined}
            onDelete={overlayTx ? deleteOverlayTransaction : undefined}
            onOpenInApp={
              overlayTx && !isReceiptOverlay
                ? () => openInApp(listHrefFor('transaction') ?? '/transactions')
                : undefined
            }
            openInAppLabel={listLabelFor('transaction')}
            isSubmitting={
              updateTransaction.isPending ||
              deleteTransaction.isPending ||
              confirmReceiptItems.isPending
            }
          />

          <BudgetForm
            open={!!overlayBudget}
            onOpenChange={(next) => {
              if (!next) setOverlayBudget(null)
            }}
            categories={categories}
            currency={currency}
            budget={overlayBudget}
            onSubmit={saveOverlayBudget}
            onDelete={overlayBudget ? deleteOverlayBudget : undefined}
            onOpenInApp={
              overlayBudget ? () => openInApp(listHrefFor('budget') ?? '/budgets') : undefined
            }
            openInAppLabel={listLabelFor('budget')}
            isSubmitting={updateBudget.isPending || deleteBudget.isPending}
          />

          <DebtForm
            open={!!overlayDebt}
            onOpenChange={(next) => {
              if (!next) setOverlayDebt(null)
            }}
            currency={currency}
            debt={overlayDebt}
            onSubmit={saveOverlayDebt}
            onDelete={overlayDebt ? deleteOverlayDebt : undefined}
            onOpenInApp={
              overlayDebt ? () => openInApp(listHrefFor('debt') ?? '/goals?tab=debts') : undefined
            }
            openInAppLabel={listLabelFor('debt')}
            isSubmitting={updateDebt.isPending || deleteDebt.isPending}
          />

          {walletId && (
            <GoalForm
              open={!!overlayGoal}
              onOpenChange={(next) => {
                if (!next) setOverlayGoal(null)
              }}
              walletId={walletId}
              currency={currency}
              goal={overlayGoal}
              onSubmit={saveOverlayGoal}
              onDelete={overlayGoal ? deleteOverlayGoal : undefined}
              onOpenInApp={
                overlayGoal ? () => openInApp(listHrefFor('goal') ?? '/goals') : undefined
              }
              openInAppLabel={listLabelFor('goal')}
              isSubmitting={updateGoal.isPending || deleteGoal.isPending}
            />
          )}
        </div>
        </SheetContent>
      </Sheet>

      {!isQuick && (
        <AiSettingsSheet
          open={aiSettingsOpen}
          onOpenChange={setAiSettingsOpen}
          onOpenFullSettings={() => navigateAway('/settings?tab=ai')}
        />
      )}
    </>
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

// Minimal markdown for the AI's replies, **bold** spans and "- "/"* " bullet
// lists, just enough to read naturally without pulling in a markdown library.
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

