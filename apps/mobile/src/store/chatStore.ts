import { create } from 'zustand';
import type { ChatAction, ChatMessage, PendingAction } from '@/src/api/types';

const nextId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

interface ChatState {
  open: boolean;
  prefill: string;
  autoSend: boolean;
  messages: ChatMessage[];
  conversationId: string | undefined;
  streamingId: string | null;
  actionStatus: Record<string, 'confirmed' | 'cancelled'>;
  openChat: (prefill?: string, opts?: { autoSend?: boolean }) => void;
  closeChat: () => void;
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setConversationId: (id: string | undefined) => void;
  appendToken: (messageId: string, token: string) => void;
  addUserMessage: (text: string) => string;
  startAssistantMessage: () => string;
  finalizeAssistantMessage: (
    messageId: string,
    payload: {
      text: string;
      pendingActions?: PendingAction[];
      actions?: ChatAction[];
      autoApplied?: boolean;
    },
  ) => void;
  setActionStatus: (actionId: string, status: 'confirmed' | 'cancelled') => void;
  clearConversation: () => void;
  consumeAutoSend: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  open: false,
  prefill: '',
  autoSend: false,
  messages: [],
  conversationId: undefined,
  streamingId: null,
  actionStatus: {},

  openChat: (prefill = '', opts) =>
    set({
      open: true,
      prefill,
      autoSend: opts?.autoSend ?? false,
    }),

  closeChat: () =>
    set({
      open: false,
      prefill: '',
      autoSend: false,
      streamingId: null,
    }),

  setMessages: (messages) =>
    set((s) => ({
      messages: typeof messages === 'function' ? messages(s.messages) : messages,
    })),

  setConversationId: (id) => set({ conversationId: id }),

  appendToken: (messageId, token) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, text: m.text + token, streaming: true } : m,
      ),
    })),

  addUserMessage: (text) => {
    const id = nextId();
    set((s) => ({
      messages: [...s.messages, { id, role: 'user', text }],
    }));
    return id;
  },

  startAssistantMessage: () => {
    const id = nextId();
    set((s) => ({
      messages: [...s.messages, { id, role: 'assistant', text: '', streaming: true }],
      streamingId: id,
    }));
    return id;
  },

  finalizeAssistantMessage: (messageId, payload) =>
    set((s) => ({
      streamingId: null,
      messages: s.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              text: payload.text,
              pendingActions: payload.pendingActions,
              actions: payload.actions,
              autoApplied: payload.autoApplied,
              streaming: false,
            }
          : m,
      ),
    })),

  setActionStatus: (actionId, status) =>
    set((s) => ({
      actionStatus: { ...s.actionStatus, [actionId]: status },
    })),

  clearConversation: () =>
    set({
      messages: [],
      conversationId: undefined,
      actionStatus: {},
      streamingId: null,
    }),

  consumeAutoSend: () => set({ autoSend: false }),
}));
