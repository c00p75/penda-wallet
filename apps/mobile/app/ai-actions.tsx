import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, Card, Screen, LoadingView, Badge } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { colors, spacing } from '@/src/lib/theme';
import { canUndoAiAction, fetchAiPendingActions, undoAiAction } from '@/src/api/audit';
import { useAuthStore } from '@/src/store/authStore';

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function AiActionsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  const { data: actions = [], isLoading } = useQuery({
    queryKey: ['ai-pending-actions', session?.user.id],
    queryFn: () => fetchAiPendingActions(session!.user.id),
    enabled: !!session?.user.id,
  });

  const undoMut = useMutation({
    mutationFn: (action: (typeof actions)[number]) => undoAiAction(action, session!.user.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-pending-actions', session?.user.id] });
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['profile', session?.user.id] });
      Alert.alert('Undone', 'AI confirmations are required again.');
    },
    onError: (err) => Alert.alert('Error', err instanceof Error ? err.message : 'Could not undo'),
  });

  if (isLoading) return <LoadingView />;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </AnimatedPressable>
        <Text variant="h2">AI actions</Text>
        <View style={styles.spacer} />
      </View>

      {actions.length === 0 ? (
        <Text variant="body" color={colors.textSecondary} style={styles.empty}>
          No staged AI actions yet. Updates and deletes land here first.
        </Text>
      ) : (
        actions.map((a) => {
          const canUndo = canUndoAiAction(a);
          return (
            <Card key={a.id} style={styles.action}>
              <Text variant="bodyMedium">{a.summary}</Text>
              <View style={styles.meta}>
                <Badge label={a.status} tone="muted" />
                <Text variant="caption" color={colors.textMuted}>
                  {a.kind} · {a.domain} · {relativeTime(a.created_at)}
                </Text>
              </View>
              {canUndo ? (
                <Button
                  title="Undo"
                  variant="secondary"
                  onPress={() => undoMut.mutate(a)}
                  loading={undoMut.isPending}
                  style={styles.undoBtn}
                />
              ) : null}
            </Card>
          );
        })
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
  empty: { textAlign: 'center', marginTop: spacing.xxxl },
  action: { marginBottom: spacing.sm, gap: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  undoBtn: { alignSelf: 'flex-start' },
});
