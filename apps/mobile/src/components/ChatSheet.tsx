import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useQueryClient } from '@tanstack/react-query';
import { Text, Input, Button } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { colors, radius, spacing } from '@/src/lib/theme';
import { useChatStore } from '@/src/store/chatStore';
import { confirmAiAction, sendChatMessageStream } from '@/src/api/chat';
import type { ChatMessage, PendingAction } from '@/src/api/types';
import { parseMoMoText } from '@/src/lib/momoParser';
import { useVoiceRecorder } from '@/src/hooks/useVoiceRecorder';
import {
  assistantAskedQuestion,
  shouldContinueListening,
} from '@/src/lib/voiceConversation';

interface ChatSheetProps {
  walletId: string;
  currency: string;
  onClose: () => void;
}

const HOLD_THRESHOLD_MS = 250;
const SILENCE_LEVEL = 0.08;
const SILENCE_STOP_MS = 1400;

type RecordMode = 'idle' | 'holding' | 'locked';

export function ChatSheet({ walletId, currency, onClose }: ChatSheetProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const abortRef = useRef<AbortController | null>(null);

  const messages = useChatStore((s) => s.messages);
  const conversationId = useChatStore((s) => s.conversationId);
  const streamingId = useChatStore((s) => s.streamingId);
  const actionStatus = useChatStore((s) => s.actionStatus);
  const prefill = useChatStore((s) => s.prefill);
  const autoSend = useChatStore((s) => s.autoSend);
  const startRecordingFlag = useChatStore((s) => s.startRecording);

  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const startAssistantMessage = useChatStore((s) => s.startAssistantMessage);
  const appendToken = useChatStore((s) => s.appendToken);
  const finalizeAssistantMessage = useChatStore((s) => s.finalizeAssistantMessage);
  const setConversationId = useChatStore((s) => s.setConversationId);
  const setActionStatus = useChatStore((s) => s.setActionStatus);
  const consumeAutoSend = useChatStore((s) => s.consumeAutoSend);
  const consumeStartRecording = useChatStore((s) => s.consumeStartRecording);
  const setMessages = useChatStore((s) => s.setMessages);

  const [input, setInput] = useState(prefill);
  const [sending, setSending] = useState(false);
  const [recordMode, setRecordMode] = useState<RecordMode>('idle');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baseInputRef = useRef('');
  const pressStartRef = useRef(0);
  const voiceTurnRef = useRef(false);
  const suppressRelistenRef = useRef(false);
  const relistenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechHeardRef = useRef(false);
  const silenceSinceRef = useRef<number | null>(null);
  const silenceStoppingRef = useRef(false);
  const mountedRef = useRef(true);

  const voice = useVoiceRecorder({
    currency,
    onError: (message) => {
      setRecordMode('idle');
      setError(message);
    },
  });

  const busy = sending || streamingId !== null || voice.state === 'transcribing';
  const isRecording = recordMode !== 'idle';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (relistenTimeoutRef.current != null) clearTimeout(relistenTimeoutRef.current);
      void voice.discard();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (prefill) setInput(prefill);
  }, [prefill]);

  useEffect(() => {
    if (autoSend && prefill && !busy) {
      consumeAutoSend();
      void sendMessage(prefill);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend, prefill]);

  useEffect(() => {
    if (!startRecordingFlag) return;
    consumeStartRecording();
    baseInputRef.current = input;
    setRecordMode('locked');
    voiceTurnRef.current = true;
    speechHeardRef.current = false;
    silenceSinceRef.current = null;
    void voice.start().catch(() => setRecordMode('idle'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startRecordingFlag]);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const maybeRelisten = useCallback(
    (reply: string, pending: PendingAction[] | undefined) => {
      const hasPending = (pending ?? []).some((a) => !actionStatus[a.id]);
      if (
        !shouldContinueListening({
          voiceConversationEnabled: true,
          wasVoiceTurn: voiceTurnRef.current,
          hasPendingConfirm: hasPending,
          assistantAskedQuestion: assistantAskedQuestion(reply),
        })
      ) {
        voiceTurnRef.current = false;
        return;
      }
      if (relistenTimeoutRef.current != null) clearTimeout(relistenTimeoutRef.current);
      relistenTimeoutRef.current = setTimeout(() => {
        relistenTimeoutRef.current = null;
        if (!mountedRef.current || suppressRelistenRef.current) {
          voiceTurnRef.current = false;
          return;
        }
        baseInputRef.current = '';
        setInput('');
        setRecordMode('locked');
        speechHeardRef.current = false;
        silenceSinceRef.current = null;
        void voice.start().catch(() => setRecordMode('idle'));
      }, 400);
    },
    [actionStatus, voice],
  );

  const sendMessage = useCallback(
    async (text: string, opts?: { fromVoice?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      if (opts?.fromVoice) voiceTurnRef.current = true;
      setError(null);
      setSending(true);
      addUserMessage(trimmed);
      setInput('');
      scrollToEnd();

      const assistantId = startAssistantMessage();
      scrollToEnd();

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await sendChatMessageStream(
          walletId,
          trimmed,
          conversationId,
          {
            onMeta: ({ conversationId: cid }) => setConversationId(cid),
            onToken: ({ text: token }) => {
              appendToken(assistantId, token);
              scrollToEnd();
            },
            onReset: () => {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, text: '' } : m)),
              );
            },
            onDone: (payload) => {
              setConversationId(payload.conversationId);
              finalizeAssistantMessage(assistantId, {
                text: payload.reply,
                pendingActions: payload.pendingActions,
                actions: payload.actions,
                autoApplied: payload.autoApplied,
              });
              void queryClient.invalidateQueries({ queryKey: ['transactions', walletId] });
              void queryClient.invalidateQueries({ queryKey: ['budgets', walletId] });
              void queryClient.invalidateQueries({ queryKey: ['goals', walletId] });
              scrollToEnd();
              maybeRelisten(payload.reply, payload.pendingActions);
            },
            onError: ({ error: errMsg }) => {
              setError(errMsg);
              voiceTurnRef.current = false;
            },
          },
          controller.signal,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to send message';
        setError(msg);
        voiceTurnRef.current = false;
        finalizeAssistantMessage(assistantId, {
          text: `Sorry, something went wrong: ${msg}`,
        });
      } finally {
        setSending(false);
      }
    },
    [
      busy,
      walletId,
      conversationId,
      addUserMessage,
      startAssistantMessage,
      appendToken,
      finalizeAssistantMessage,
      setConversationId,
      setMessages,
      queryClient,
      scrollToEnd,
      maybeRelisten,
    ],
  );

  const handleConfirm = async (action: PendingAction, decision: 'confirm' | 'cancel') => {
    setResolvingId(action.id);
    try {
      await confirmAiAction(action.id, decision);
      setActionStatus(action.id, decision === 'confirm' ? 'confirmed' : 'cancelled');
      void queryClient.invalidateQueries({ queryKey: ['transactions', walletId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setResolvingId(null);
    }
  };

  function mergedTranscript(finalText: string) {
    const base = baseInputRef.current;
    return base && finalText ? `${base} ${finalText}` : base || finalText;
  }

  async function beginRecording() {
    suppressRelistenRef.current = false;
    speechHeardRef.current = false;
    silenceSinceRef.current = null;
    setError(null);
    baseInputRef.current = input;
    await voice.start();
  }

  async function finishRecording(submit: boolean) {
    const { transcript, discarded } = await voice.stop();
    setRecordMode('idle');
    speechHeardRef.current = false;
    silenceSinceRef.current = null;
    silenceStoppingRef.current = false;
    if (discarded) {
      setInput(baseInputRef.current);
      return;
    }
    if (!transcript.trim()) {
      setInput(baseInputRef.current);
      setError('Could not catch that. Try again a little closer to the mic.');
      return;
    }
    const combined = mergedTranscript(transcript);
    if (submit) void sendMessage(combined, { fromVoice: true });
    else setInput(combined);
  }

  async function cancelRecording() {
    await voice.discard();
    setRecordMode('idle');
    speechHeardRef.current = false;
    silenceSinceRef.current = null;
    setInput(baseInputRef.current);
    setError(null);
  }

  function onMicPressIn() {
    if (recordMode === 'locked') {
      void finishRecording(false);
      return;
    }
    if (recordMode !== 'idle') return;
    pressStartRef.current = Date.now();
    setRecordMode('holding');
    void beginRecording();
  }

  function onMicPressOut() {
    if (recordMode !== 'holding') return;
    const held = Date.now() - pressStartRef.current;
    if (held >= HOLD_THRESHOLD_MS) void finishRecording(true);
    else setRecordMode('locked');
  }

  // Silence auto-stop after speech has been detected.
  useEffect(() => {
    if (recordMode === 'idle' || voice.state !== 'recording') {
      speechHeardRef.current = false;
      silenceSinceRef.current = null;
      silenceStoppingRef.current = false;
      return;
    }
    if (silenceStoppingRef.current) return;
    const level = voice.level;
    if (level >= SILENCE_LEVEL) {
      speechHeardRef.current = true;
      silenceSinceRef.current = null;
      return;
    }
    if (!speechHeardRef.current) return;
    const now = Date.now();
    if (silenceSinceRef.current == null) silenceSinceRef.current = now;
    if (now - silenceSinceRef.current < SILENCE_STOP_MS) return;
    silenceSinceRef.current = null;
    silenceStoppingRef.current = true;
    void finishRecording(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.level, voice.state, recordMode]);

  const handlePasteMoMo = async () => {
    const text = await Clipboard.getStringAsync();
    if (!text.trim()) {
      setError('Clipboard is empty');
      return;
    }
    const parsed = parseMoMoText(text);
    if (parsed) {
      const hint = `I ${parsed.type === 'expense' ? 'spent' : 'received'} ${parsed.amountMinor / 100} ${parsed.currencyHint ?? currency}${parsed.merchant ? ` at ${parsed.merchant}` : ''}`;
      setInput(hint);
    } else {
      setInput(text.slice(0, 500));
      setError('Could not parse MoMo SMS. Pasted raw text instead');
    }
  };

  const statusText =
    voice.state === 'transcribing'
      ? 'Finishing…'
      : recordMode === 'holding'
        ? 'Listening. Release to send'
        : recordMode === 'locked'
          ? 'Listening. Tap the mic to stop'
          : null;

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageWrap, isUser ? styles.userWrap : styles.assistantWrap]}>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          <Text variant="body" color={isUser ? '#FFF' : colors.text}>
            {item.text}
            {item.streaming ? ' ▍' : ''}
          </Text>
        </View>
        {!isUser && item.actions?.length ? (
          <View style={styles.trail}>
            {item.actions.map((a) => (
              <View key={a.id} style={styles.actionRow}>
                <Ionicons
                  name={a.status === 'error' ? 'alert-circle' : 'checkmark-circle'}
                  size={16}
                  color={a.status === 'error' ? colors.rose : colors.mint}
                />
                <Text variant="caption" color={colors.textSecondary} style={styles.actionText}>
                  {a.label}: {a.summary}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {!isUser && item.pendingActions?.length ? (
          <View style={styles.trail}>
            {item.pendingActions.map((action) => {
              const status = actionStatus[action.id];
              return (
                <View key={action.id} style={styles.pendingCard}>
                  <Text variant="small">{action.summary}</Text>
                  {status ? (
                    <Text variant="caption" color={colors.textMuted}>
                      {status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
                    </Text>
                  ) : (
                    <View style={styles.pendingActions}>
                      <Button
                        title="Confirm"
                        onPress={() => void handleConfirm(action, 'confirm')}
                        loading={resolvingId === action.id}
                        style={styles.pendingBtn}
                      />
                      <Button
                        title="Cancel"
                        variant="secondary"
                        onPress={() => void handleConfirm(action, 'cancel')}
                        disabled={resolvingId === action.id}
                        style={styles.pendingBtn}
                      />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Animated.View
      entering={SlideInDown.springify().damping(20)}
      style={[styles.sheet, { paddingBottom: insets.bottom + spacing.sm }]}
    >
      <View style={styles.handle} />
      <View style={styles.header}>
        <Text variant="h3">Ask Penda</Text>
        <AnimatedPressable
          onPress={() => {
            void voice.discard();
            onClose();
          }}
          scaleTo={0.9}
        >
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </AnimatedPressable>
      </View>

      <Pressable onPress={handlePasteMoMo} style={styles.momoHint}>
        <Ionicons name="clipboard-outline" size={16} color={colors.iris} />
        <Text variant="caption" color={colors.iris}>
          Paste MoMo SMS from clipboard
        </Text>
      </Pressable>

      {error ? (
        <Text variant="caption" color={colors.rose} style={styles.error}>
          {error}
        </Text>
      ) : null}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.list}
        onContentSizeChange={scrollToEnd}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Ionicons name="sparkles" size={32} color={colors.iris} />
            <Text variant="body" color={colors.textSecondary} style={styles.emptyText}>
              Ask me about your spending, budgets, or paste a MoMo message.
            </Text>
          </View>
        }
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {statusText ? (
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text variant="caption" color={colors.textSecondary} style={styles.statusText}>
              {statusText}
            </Text>
            {isRecording && voice.state === 'recording' ? (
              <View style={styles.levelMeter} accessibilityElementsHidden>
                {[0.35, 0.7, 1, 0.55, 0.4].map((weight, i) => (
                  <View
                    key={i}
                    style={[
                      styles.levelBar,
                      { height: Math.max(3, Math.round(voice.level * weight * 12)) },
                    ]}
                  />
                ))}
              </View>
            ) : null}
            {isRecording ? (
              <Pressable onPress={() => void cancelRecording()} hitSlop={8}>
                <Text variant="caption" color={colors.rose}>
                  Cancel
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <View style={styles.inputRow}>
          <AnimatedPressable
            onPressIn={onMicPressIn}
            onPressOut={onMicPressOut}
            disabled={voice.state === 'transcribing'}
            style={[styles.micBtn, isRecording && styles.micActive]}
          >
            {voice.state === 'transcribing' ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Ionicons name="mic" size={22} color={isRecording ? '#FFF' : colors.iris} />
            )}
          </AnimatedPressable>
          <Input
            value={input}
            onChangeText={(text) => {
              suppressRelistenRef.current = true;
              if (relistenTimeoutRef.current != null) {
                clearTimeout(relistenTimeoutRef.current);
                relistenTimeoutRef.current = null;
              }
              setInput(text);
            }}
            onFocus={() => {
              suppressRelistenRef.current = true;
              if (relistenTimeoutRef.current != null) {
                clearTimeout(relistenTimeoutRef.current);
                relistenTimeoutRef.current = null;
              }
            }}
            placeholder={isRecording ? 'Listening…' : 'Message Penda…'}
            style={styles.input}
            multiline
            editable={!busy || isRecording}
          />
          <AnimatedPressable
            onPress={() => void sendMessage(input)}
            disabled={busy || !input.trim()}
            style={[styles.sendBtn, (!input.trim() || busy) && styles.sendDisabled]}
          >
            <Ionicons name="send" size={20} color="#FFF" />
          </AnimatedPressable>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  momoHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.irisSoft,
    borderRadius: radius.md,
  },
  error: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    flexGrow: 1,
  },
  emptyChat: {
    alignItems: 'center',
    paddingTop: spacing.xxxl,
    gap: spacing.md,
  },
  emptyText: {
    textAlign: 'center',
    maxWidth: 280,
  },
  messageWrap: {
    marginBottom: spacing.md,
  },
  userWrap: {
    alignItems: 'flex-end',
  },
  assistantWrap: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  userBubble: {
    backgroundColor: colors.iris,
    borderBottomRightRadius: spacing.xs,
  },
  assistantBubble: {
    backgroundColor: colors.surfaceMuted,
    borderBottomLeftRadius: spacing.xs,
  },
  trail: {
    marginTop: spacing.sm,
    gap: spacing.xs,
    maxWidth: '90%',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionText: {
    flex: 1,
  },
  pendingCard: {
    backgroundColor: colors.apricotSoft,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  pendingActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pendingBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.iris,
  },
  statusText: {
    flex: 1,
  },
  levelMeter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 12,
  },
  levelBar: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: colors.iris,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    minHeight: 44,
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.irisSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micActive: {
    backgroundColor: colors.rose,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.iris,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.4,
  },
});
