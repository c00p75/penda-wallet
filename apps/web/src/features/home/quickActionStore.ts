import { create } from 'zustand'

export type QuickActionIntent = 'add-txn' | 'scan-receipt'

interface QuickActionState {
  intent: QuickActionIntent | null
  /** Queue a one-shot intent for Home to consume (e.g. after navigating from the menu). */
  request: (intent: QuickActionIntent) => void
  /** Take and clear the pending intent, if any. */
  consume: () => QuickActionIntent | null
}

export const useQuickActionStore = create<QuickActionState>((set, get) => ({
  intent: null,
  request: (intent) => set({ intent }),
  consume: () => {
    const { intent } = get()
    if (intent) set({ intent: null })
    return intent
  },
}))
