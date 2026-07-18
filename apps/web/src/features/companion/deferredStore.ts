import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DeferredQuestion } from './deferredQuestions'

interface DeferredState {
  byWallet: Record<string, DeferredQuestion[]>
  enqueue: (
    walletId: string,
    question: string,
    opts?: { context?: Record<string, unknown>; askAfterMs?: number },
  ) => DeferredQuestion
  markAsked: (walletId: string, id: string) => void
  markDismissed: (walletId: string, id: string) => void
  markAnswered: (walletId: string, id: string) => void
}

function id() {
  return crypto.randomUUID()
}

/** Stable empty list so zustand selectors don't infinite-loop on `?? []`. */
export const EMPTY_DEFERRED: DeferredQuestion[] = []

export const useDeferredStore = create<DeferredState>()(
  persist(
    (set) => ({
      byWallet: {},

      enqueue: (walletId, question, opts) => {
        const now = Date.now()
        const row: DeferredQuestion = {
          id: id(),
          question: question.trim(),
          context: opts?.context,
          status: 'pending',
          createdAt: new Date(now).toISOString(),
          askAfter: new Date(now + (opts?.askAfterMs ?? 5 * 60_000)).toISOString(),
        }
        set((s) => ({
          byWallet: {
            ...s.byWallet,
            [walletId]: [...(s.byWallet[walletId] ?? []).filter((q) => q.status === 'pending'), row].slice(
              -20,
            ),
          },
        }))
        return row
      },

      markAsked: (walletId, qid) =>
        set((s) => ({
          byWallet: {
            ...s.byWallet,
            [walletId]: (s.byWallet[walletId] ?? []).map((q) =>
              q.id === qid ? { ...q, status: 'asked' as const } : q,
            ),
          },
        })),

      markDismissed: (walletId, qid) =>
        set((s) => ({
          byWallet: {
            ...s.byWallet,
            [walletId]: (s.byWallet[walletId] ?? []).map((q) =>
              q.id === qid ? { ...q, status: 'dismissed' as const } : q,
            ),
          },
        })),

      markAnswered: (walletId, qid) =>
        set((s) => ({
          byWallet: {
            ...s.byWallet,
            [walletId]: (s.byWallet[walletId] ?? []).map((q) =>
              q.id === qid ? { ...q, status: 'answered' as const } : q,
            ),
          },
        })),
    }),
    { name: 'penda-deferred-questions' },
  ),
)
