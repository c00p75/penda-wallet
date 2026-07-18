import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, EmptyState, LoadingView } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { colors, radius, spacing } from '@/src/lib/theme';
import { fetchNotifications, markNotificationsRead } from '@/src/api/notifications';
import type { AppNotification } from '@/src/api/types';

export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchNotifications(),
  });

  const markReadMutation = useMutation({
    mutationFn: (ids?: string[]) => markNotificationsRead(ids),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  if (isLoading) return <LoadingView label="Loading notifications…" />;

  const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </AnimatedPressable>
        <Text variant="h2">Notifications</Text>
        {unreadIds.length > 0 ? (
          <AnimatedPressable onPress={() => markReadMutation.mutate(unreadIds)}>
            <Text variant="label" color={colors.iris}>
              Mark read
            </Text>
          </AnimatedPressable>
        ) : (
          <View style={styles.spacer} />
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.iris} />
        }
        renderItem={({ item }) => <NotificationRow item={item} />}
        ListEmptyComponent={
          <EmptyState title="All caught up" subtitle="No notifications right now." />
        }
      />
    </View>
  );
}

function NotificationRow({ item }: { item: AppNotification }) {
  const unread = !item.read_at;
  return (
    <View style={[styles.row, unread && styles.rowUnread]}>
      <View style={styles.rowContent}>
        <Text variant="bodyMedium">{item.title}</Text>
        <Text variant="small" color={colors.textSecondary}>
          {item.body}
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
      {unread ? <View style={styles.dot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: {
    width: 70,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowUnread: {
    borderColor: colors.iris,
    backgroundColor: colors.irisSoft,
  },
  rowContent: {
    flex: 1,
    gap: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.iris,
    marginLeft: spacing.sm,
  },
});
