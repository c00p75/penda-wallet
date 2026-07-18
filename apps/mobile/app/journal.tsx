import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, Card, Input, Screen, LoadingView } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { colors, radius, spacing } from '@/src/lib/theme';
import { createMemory, deleteMemory, fetchMemories } from '@/src/api/memory';
import { useAuthStore } from '@/src/store/authStore';
import { useCurrentWallet } from '@/src/hooks/useCurrentWallet';
import type { AiMemory } from '@/src/api/types';

const MOODS = ['😌', '😄', '😰', '😞', '😤', '🤑'];

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function JournalScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const { wallet } = useCurrentWallet();
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<string | null>(null);

  const { data: memories = [], isLoading } = useQuery({
    queryKey: ['memories', session?.user.id],
    queryFn: () => fetchMemories(session!.user.id),
    enabled: !!session?.user.id,
  });

  const journal = useMemo(
    () => memories.filter((m) => m.kind === 'note' || m.kind === 'mood' || m.kind === 'fact' || m.kind === 'preference'),
    [memories],
  );

  const createMut = useMutation({
    mutationFn: () =>
      createMemory(session!.user.id, {
        wallet_id: wallet?.id ?? null,
        kind: mood ? 'mood' : 'note',
        content: content.trim(),
        mood,
      }),
    onSuccess: () => {
      setContent('');
      setMood(null);
      void queryClient.invalidateQueries({ queryKey: ['memories', session?.user.id] });
    },
    onError: (err) => Alert.alert('Error', err instanceof Error ? err.message : 'Could not save'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteMemory(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['memories', session?.user.id] }),
  });

  if (isLoading) return <LoadingView />;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </AnimatedPressable>
        <Text variant="h2">Journal</Text>
        <View style={styles.spacer} />
      </View>

      <Card style={styles.compose}>
        <View style={styles.moods}>
          {MOODS.map((m) => (
            <Pressable
              key={m}
              onPress={() => setMood(mood === m ? null : m)}
              style={[styles.moodBtn, mood === m && styles.moodBtnActive]}
            >
              <Text style={styles.moodEmoji}>{m}</Text>
            </Pressable>
          ))}
        </View>
        <Input
          value={content}
          onChangeText={setContent}
          placeholder="How did money feel today?"
          multiline
          style={styles.textArea}
        />
        <Button
          title="Add to journal"
          onPress={() => createMut.mutate()}
          disabled={!content.trim()}
          loading={createMut.isPending}
          style={styles.addBtn}
        />
      </Card>

      {journal.length === 0 ? (
        <Text variant="body" color={colors.textSecondary} style={styles.empty}>
          Nothing here yet. Notes help Penda spot your patterns.
        </Text>
      ) : (
        journal.map((m: AiMemory) => (
          <Card key={m.id} style={styles.entry}>
            <View style={styles.entryHeader}>
              <Text style={styles.entryMood}>{m.mood ?? '📝'}</Text>
              <AnimatedPressable onPress={() => deleteMut.mutate(m.id)}>
                <Ionicons name="trash-outline" size={18} color={colors.rose} />
              </AnimatedPressable>
            </View>
            <Text variant="body">{m.content}</Text>
            <Text variant="caption" color={colors.textMuted}>
              {relativeTime(m.created_at)}
            </Text>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  spacer: { width: 22 },
  compose: { gap: spacing.md, marginBottom: spacing.xl },
  moods: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  moodBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  moodBtnActive: { backgroundColor: colors.irisSoft, borderWidth: 1, borderColor: colors.iris },
  moodEmoji: { fontSize: 20 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  addBtn: { alignSelf: 'flex-end' },
  empty: { textAlign: 'center', marginTop: spacing.xxxl },
  entry: { marginBottom: spacing.sm, gap: spacing.xs },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  entryMood: { fontSize: 22 },
});
