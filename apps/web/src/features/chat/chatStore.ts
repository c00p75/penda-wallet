import { create } from 'zustand'

interface ChatUiState {
  open: boolean
  prefill: string
  /**
   * When true, the seeded prefill is sent the moment the sheet opens, so Penda
   * replies first instead of waiting for the user to hit Send. Used by flows
   * that want the AI to speak first (e.g. assisting a freshly-set plan).
   */
  autoSend: boolean
  /**
   * Open the ambient chat from anywhere, optionally seeding the input. Pass
   * `{ autoSend: true }` to fire the seed immediately (Penda speaks first).
   */
  openChat: (prefill?: string, opts?: { autoSend?: boolean }) => void
  setOpen: (open: boolean) => void
  /** Clear the auto-send flag once the sheet has consumed it, so it fires once. */
  consumeAutoSend: () => void
}

export const useChatStore = create<ChatUiState>((set) => ({
  open: false,
  prefill: '',
  autoSend: false,
  openChat: (prefill = '', opts) => set({ open: true, prefill, autoSend: opts?.autoSend ?? false }),
  setOpen: (open) => set({ open }),
  consumeAutoSend: () => set({ autoSend: false }),
}))
