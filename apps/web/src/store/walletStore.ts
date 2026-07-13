import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface WalletState {
  currentWalletId: string | null
  setCurrentWalletId: (id: string) => void
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      currentWalletId: null,
      setCurrentWalletId: (id) => set({ currentWalletId: id }),
    }),
    { name: 'penda-wallet-selection' },
  ),
)
