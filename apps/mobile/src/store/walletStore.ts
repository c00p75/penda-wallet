import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface WalletState {
  activeWalletId: string | null;
  setActiveWalletId: (id: string | null) => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      activeWalletId: null,
      setActiveWalletId: (id) => set({ activeWalletId: id }),
    }),
    {
      name: 'penda:active-wallet',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
