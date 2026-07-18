import { create } from 'zustand'

export type ChatMode = 'full' | 'quick'

export type OpenChatOpts = {
  /** Send the seed immediately so Penda replies first. */
  autoSend?: boolean
  /** `quick` = half-sheet for micro-intents; `full` = page (default). */
  mode?: ChatMode
  /** Begin voice capture as soon as the sheet opens. */
  startRecording?: boolean
}

interface ChatUiState {
  open: boolean
  prefill: string
  autoSend: boolean
  mode: ChatMode
  startRecording: boolean
  /** Bumped to ask ChatSheet to start a fresh conversation (clear local thread). */
  newTopicNonce: number
  /**
   * Open the ambient chat from anywhere, optionally seeding the input. Pass
   * `{ autoSend: true }` to fire the seed immediately (Penda speaks first).
   */
  openChat: (prefill?: string, opts?: OpenChatOpts) => void
  setOpen: (open: boolean) => void
  setMode: (mode: ChatMode) => void
  /** Clear the auto-send flag once the sheet has consumed it, so it fires once. */
  consumeAutoSend: () => void
  /** Clear the start-recording flag once the sheet has begun listening. */
  consumeStartRecording: () => void
  /** Start a new conversation topic (clears messages / conversation id in the sheet). */
  startNewTopic: () => void
}

export const useChatStore = create<ChatUiState>((set) => ({
  open: false,
  prefill: '',
  autoSend: false,
  mode: 'full',
  startRecording: false,
  newTopicNonce: 0,
  openChat: (prefill = '', opts) =>
    set({
      open: true,
      prefill,
      autoSend: opts?.autoSend ?? false,
      mode: opts?.mode ?? (prefill.startsWith('I spent') && !opts?.autoSend ? 'quick' : 'full'),
      startRecording: opts?.startRecording ?? false,
    }),
  setOpen: (open) =>
    set({
      open,
      // Reset ephemeral flags when closing so the next open is clean.
      ...(open
        ? {}
        : { autoSend: false, startRecording: false, prefill: '', mode: 'full' as ChatMode }),
    }),
  setMode: (mode) => set({ mode }),
  consumeAutoSend: () => set({ autoSend: false }),
  consumeStartRecording: () => set({ startRecording: false }),
  startNewTopic: () => set((s) => ({ newTopicNonce: s.newTopicNonce + 1 })),
}))
