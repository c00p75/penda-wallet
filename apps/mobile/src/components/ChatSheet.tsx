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
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useQueryClient } from '@tanstack/react-query';
import { Text, Input, Button } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { colors, radius, spacing } from '@/src/lib/theme';
import { useChatStore } from '@/src/store/chatStore';
import { confirmAiAction, sendChatMessageStream, transcribeVoice } from '@/src/api/chat';
import type { ChatMessage, PendingAction } from '@/src/api/types';
import { parseMoMoText } from '@/src/lib/momoParser';

interface ChatSheetProps {
  walletId: string;
  currency: string;
  onClose: () => void;
}

export function ChatSheet({ walletId, currency, onClose }: ChatSheetProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const messages = useChatStore((s) => s.messages);
  const conversationId = useChatStore((s) => s.conversationId);
  const streamingId = useChatStore((s) => s.streamingId);
  const actionStatus = useChatStore((s) => s.actionStatus);
  const prefill = useChatStore((s) => s.prefill);
  const autoSend = useChatStore((s) => s.autoSend);

  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const startAssistantMessage = useChatStore((s) => s.startAssistantMessage);
  const appendToken = useChatStore((s) => s.appendToken);
  const finalizeAssistantMessage = useChatStore((s) => s.finalizeAssistantMessage);
  const setConversationId = useChatStore((s) => s.setConversationId);
  const setActionStatus = useChatStore((s) => s.setActionStatus);
  const consumeAutoSend = useChatStore((s) => s.consumeAutoSend);
  const setMessages = useChatStore((s) => s.setMessages);

  const [input, setInput] = useState(prefill);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = sending || streamingId !== null;

  useEffect(() => {
    if (prefill) setInput(prefill);
  }, [prefill]);

  useEffect(() => {
    if (autoSend && prefill && !busy) {
      consumeAutoSend();
      void sendMessage(prefill);
    }
  }, [autoSend, prefill]);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

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
            },
            onError: ({ error: errMsg }) => setError(errMsg),
          },
          controller.signal,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to send message';
        setError(msg);
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

  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setRecording(true);
    } catch {
      setError('Microphone permission denied');
    }
  };

  const stopRecording = async () => {
    const rec = recordingRef.current;
    if (!rec) return;
    setRecording(false);
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;
      if (!uri) return;
      setSending(true);
      const transcript = await transcribeVoice(uri, 'voice.m4a');
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed');
    } finally {
      setSending(false);
    }
  };

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
        <AnimatedPressable onPress={onClose} scaleTo={0.9}>
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
        <View style={styles.inputRow}>
          <AnimatedPressable
            onPressIn={() => void startRecording()}
            onPressOut={() => void stopRecording()}
            style={[styles.micBtn, recording && styles.micActive]}
          >
            {recording ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Ionicons name="mic" size={22} color={recording ? '#FFF' : colors.iris} />
            )}
          </AnimatedPressable>
          <Input
            value={input}
            onChangeText={setInput}
            placeholder="Message Penda…"
            style={styles.input}
            multiline
            editable={!busy}
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
