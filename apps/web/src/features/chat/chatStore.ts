import { create } from 'zustand'
import type { ActiveAiPersonality } from '@/features/profile/types'

export type ChatMode = 'full' | 'quick'

export type OpenChatOpts = {
  /** Send the seed immediately so Penda replies first. */
  autoSend?: boolean
  /** `quick` = half-sheet for micro-intents; `full` = page (default). */
  mode?: ChatMode
  /** Begin voice capture as soon as the sheet opens. */
  startRecording?: boolean
  /**
   * A message from Penda injected as the opening assistant bubble (no server
   * round-trip). Penda speaks first: used by the onboarding walkthrough to
   * sell, guide, and ask for the data each step needs.
   */
  assistantSeed?: string
  /**
   * When set with an assistant seed, inject a portrait image message above
   * the text opener (onboarding log-step intro).
   */
  assistantPortrait?: ActiveAiPersonality
}

interface ChatUiState {
  open: boolean
  prefill: string
  autoSend: boolean
  mode: ChatMode
  startRecording: boolean
  /** Penda-speaks-first opener injected as an assistant bubble on open. */
  assistantSeed: string
  /** Optional portrait injected above the assistant seed. */
  assistantPortrait: ActiveAiPersonality | null
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
  /** Clear the assistant seed once the sheet has injected it, so it fires once. */
  consumeAssistantSeed: () => void
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
  assistantSeed: '',
  assistantPortrait: null,
  newTopicNonce: 0,
  openChat: (prefill = '', opts) =>
    set({
      open: true,
      prefill,
      autoSend: opts?.autoSend ?? false,
      mode: opts?.mode ?? (prefill.startsWith('I spent') && !opts?.autoSend ? 'quick' : 'full'),
      startRecording: opts?.startRecording ?? false,
      assistantSeed: opts?.assistantSeed ?? '',
      assistantPortrait: opts?.assistantPortrait ?? null,
    }),
  setOpen: (open) =>
    set({
      open,
      // Reset ephemeral flags when closing so the next open is clean.
      ...(open
        ? {}
        : {
            autoSend: false,
            startRecording: false,
            prefill: '',
            assistantSeed: '',
            assistantPortrait: null,
            mode: 'full' as ChatMode,
          }),
    }),
  setMode: (mode) => set({ mode }),
  consumeAutoSend: () => set({ autoSend: false, prefill: '' }),
  consumeAssistantSeed: () => set({ assistantSeed: '', assistantPortrait: null }),
  consumeStartRecording: () => set({ startRecording: false }),
  startNewTopic: () => set((s) => ({ newTopicNonce: s.newTopicNonce + 1 })),
}))
