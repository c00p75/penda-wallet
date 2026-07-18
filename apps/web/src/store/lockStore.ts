import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface LockConfig {
  pinSalt: string
  pinHash: string
  /** Base64 WebAuthn credential id, or null if the user set a PIN only. */
  credentialId: string | null
}

interface LockState {
  /** Whether balance-hiding is turned on. */
  enabled: boolean
  pinSalt: string | null
  pinHash: string | null
  credentialId: string | null
  /** Runtime-only: whether balances are currently revealed. Never persisted, so
   *  balances start hidden again on every reload. */
  unlocked: boolean
  /** Runtime-only: whether the unlock sheet is currently showing. */
  prompting: boolean

  enable: (config: LockConfig) => void
  disable: () => void
  setUnlocked: (unlocked: boolean) => void
  promptUnlock: () => void
  dismissPrompt: () => void
}

export const useLockStore = create<LockState>()(
  persist(
    (set) => ({
      enabled: false,
      pinSalt: null,
      pinHash: null,
      credentialId: null,
      unlocked: false,
      prompting: false,

      enable: (config) =>
        set({
          enabled: true,
          pinSalt: config.pinSalt,
          pinHash: config.pinHash,
          credentialId: config.credentialId,
          unlocked: true, // just set it up, no need to immediately re-unlock
        }),
      disable: () =>
        set({ enabled: false, pinSalt: null, pinHash: null, credentialId: null, unlocked: false, prompting: false }),
      setUnlocked: (unlocked) => set({ unlocked, prompting: false }),
      promptUnlock: () => set({ prompting: true }),
      dismissPrompt: () => set({ prompting: false }),
    }),
    {
      name: 'penda-lock',
      // Only the durable config is persisted, unlocked/prompting stay runtime,
      // so a fresh load always starts hidden.
      partialize: (state) => ({
        enabled: state.enabled,
        pinSalt: state.pinSalt,
        pinHash: state.pinHash,
        credentialId: state.credentialId,
      }),
    },
  ),
)
