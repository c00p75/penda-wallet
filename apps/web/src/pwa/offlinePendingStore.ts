import { create } from 'zustand'

/** Shared pending-offline count so flush runs once app-wide, not per header/page. */
interface OfflinePendingState {
  pendingCount: number
  setPendingCount: (n: number) => void
}

export const useOfflinePendingStore = create<OfflinePendingState>((set) => ({
  pendingCount: 0,
  setPendingCount: (pendingCount) => set({ pendingCount }),
}))
