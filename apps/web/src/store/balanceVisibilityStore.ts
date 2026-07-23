import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface BalanceVisibilityState {
  /** Per-card hidden flags, keyed by an id each card picks (e.g. "balance", "month"). Absent = visible. */
  hidden: Record<string, boolean>
  toggle: (id: string) => void
}

/**
 * Lightweight eye-icon show/hide for hero-card figures — separate from the
 * PIN/biometric lock (useLockStore) and blind budgeting, which both mask
 * amounts for privacy/security reasons. This is just a glance-friendly
 * declutter toggle, so it persists across reloads with no unlock step.
 * Each card's eye icon only affects its own figure, keyed by `id`.
 */
export const useBalanceVisibilityStore = create<BalanceVisibilityState>()(
  persist(
    (set) => ({
      hidden: {},
      toggle: (id) => set((s) => ({ hidden: { ...s.hidden, [id]: !s.hidden[id] } })),
    }),
    { name: 'penda-balance-visibility' },
  ),
)

export function useCardVisible(id: string): boolean {
  return useBalanceVisibilityStore((s) => !s.hidden[id])
}
