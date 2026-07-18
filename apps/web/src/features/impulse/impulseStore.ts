import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface PausedImpulse {
  id: string
  amountMinor: number
  currency: string
  merchant: string | null
  description: string | null
  pausedAt: number
  /** Resume / revisit after this timestamp. */
  until: number
}

interface ImpulseState {
  paused: PausedImpulse[]
  /** Last prompt dismissed without pausing (avoid re-asking same draft). */
  dismissedIds: string[]
  pause: (item: Omit<PausedImpulse, 'pausedAt' | 'until'> & { hours?: number }) => void
  dismiss: (id: string) => void
  clearExpired: () => void
  isDismissed: (id: string) => boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Expenses at or above this (minor units) trigger the 24h pause prompt. */
export const IMPULSE_THRESHOLD_MINOR = 100_000

export const useImpulseStore = create<ImpulseState>()(
  persist(
    (set, get) => ({
      paused: [],
      dismissedIds: [],

      pause: ({ id, amountMinor, currency, merchant, description, hours = 24 }) => {
        const now = Date.now()
        const entry: PausedImpulse = {
          id,
          amountMinor,
          currency,
          merchant,
          description,
          pausedAt: now,
          until: now + hours * 60 * 60 * 1000,
        }
        set((s) => ({
          paused: [entry, ...s.paused.filter((p) => p.id !== id)],
          dismissedIds: s.dismissedIds.filter((d) => d !== id),
        }))
      },

      dismiss: (id) =>
        set((s) => ({
          dismissedIds: s.dismissedIds.includes(id) ? s.dismissedIds : [...s.dismissedIds, id].slice(-40),
        })),

      clearExpired: () => {
        const now = Date.now()
        set((s) => ({
          paused: s.paused.filter((p) => p.until > now - DAY_MS),
        }))
      },

      isDismissed: (id) => get().dismissedIds.includes(id),
    }),
    { name: 'penda-impulse' },
  ),
)
