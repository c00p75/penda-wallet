import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface LockConfig {
  pinSalt: string;
  pinHash: string;
  /** Set when biometric unlock is enabled on this device. */
  biometricEnabled: boolean;
}

interface LockState {
  enabled: boolean;
  pinSalt: string | null;
  pinHash: string | null;
  biometricEnabled: boolean;
  unlocked: boolean;
  prompting: boolean;

  enable: (config: LockConfig) => void;
  disable: () => void;
  setUnlocked: (unlocked: boolean) => void;
  promptUnlock: () => void;
  dismissPrompt: () => void;
}

export const useLockStore = create<LockState>()(
  persist(
    (set) => ({
      enabled: false,
      pinSalt: null,
      pinHash: null,
      biometricEnabled: false,
      unlocked: false,
      prompting: false,

      enable: (config) =>
        set({
          enabled: true,
          pinSalt: config.pinSalt,
          pinHash: config.pinHash,
          biometricEnabled: config.biometricEnabled,
          unlocked: true,
        }),
      disable: () =>
        set({
          enabled: false,
          pinSalt: null,
          pinHash: null,
          biometricEnabled: false,
          unlocked: false,
          prompting: false,
        }),
      setUnlocked: (unlocked) => set({ unlocked, prompting: false }),
      promptUnlock: () => set({ prompting: true }),
      dismissPrompt: () => set({ prompting: false }),
    }),
    {
      name: 'penda-lock',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        enabled: state.enabled,
        pinSalt: state.pinSalt,
        pinHash: state.pinHash,
        biometricEnabled: state.biometricEnabled,
      }),
    },
  ),
);
