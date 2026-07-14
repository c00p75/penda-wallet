import { create } from 'zustand'

interface ChatUiState {
  open: boolean
  prefill: string
  /** Open the ambient chat from anywhere, optionally seeding the input. */
  openChat: (prefill?: string) => void
  setOpen: (open: boolean) => void
}

export const useChatStore = create<ChatUiState>((set) => ({
  open: false,
  prefill: '',
  openChat: (prefill = '') => set({ open: true, prefill }),
  setOpen: (open) => set({ open }),
}))
