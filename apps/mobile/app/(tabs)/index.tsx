import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Card, Badge, LoadingView } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { HeroBalance } from '@/src/components/HeroBalance';
import { TransactionRow } from '@/src/components/TransactionRow';
import { ProgressBar } from '@/src/components/ProgressBar';
import { colors, spacing } from '@/src/lib/theme';
import { formatMoney } from '@/src/lib/money';
import { deleteTransaction, fetchTransactions } from '@/src/api/transactions';
import { fetchBudgetProgress } from '@/src/api/budgets';
import { fetchSavingsGoals } from '@/src/api/goals';
import { fetchCategories } from '@/src/api/categories';
import { useCurrentWallet } from '@/src/hooks/useCurrentWallet';
import { computeMonthlyBalance } from '@/src/lib/transactions';
import { useAuthStore } from '@/src/store/authStore';
import { useChatStore } from '@/src/store/chatStore';
import type { Transaction } from '@/src/api/types';

function greetingLabel(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

function firstName(session: ReturnType<typeof useAuthStore.getState>['session']): string {
  const full = (session?.user.user_metadata?.full_name as string | undefined)?.trim();
  if (full) return full.split(/\s+/)[0] ?? full;
  const email = session?.user.email;
  if (email) return email.split('@')[0] ?? 'there';
  return 'there';
}

export default function HomeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const openChat = useChatStore((s) => s.openChat);
  const { wallet, isLoading: walletLoading, refetch: refetchWallets } = useCurrentWallet();

  const { data: transactions = [], isLoading: txLoading, refetch: refetchTx } = useQuery({
    queryKey: ['transactions', wallet?.id],
    queryFn: () => fetchTransactions(wallet!.id),
    enabled: !!wallet?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions', wallet?.id] });
    },
    onError: (err) => {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not delete transaction');
    },
  });

  function confirmDelete(tx: Transaction) {
    const title = tx.merchant || tx.description || 'this transaction';
    Alert.alert('Delete transaction?', `Remove ${title}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(tx.id),
      },
    ]);
  }

  const { data: budgetProgress = [], refetch: refetchBudgets } = useQuery({
    queryKey: ['budgetProgress', wallet?.id],
    queryFn: () => fetchBudgetProgress(wallet!.id),
    enabled: !!wallet?.id,
  });

  const { data: goals = [], refetch: refetchGoals } = useQuery({
    queryKey: ['goals', wallet?.id],
    queryFn: () => fetchSavingsGoals(wallet!.id),
    enabled: !!wallet?.id,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', wallet?.id],
    queryFn: () => fetchCategories(wallet!.id),
    enabled: !!wallet?.id,
  });

  const refreshing = walletLoading || txLoading;
  const onRefresh = () => {
    void refetchWallets();
    void refetchTx();
    void refetchBudgets();
    void refetchGoals();
  };

  if (walletLoading && !wallet) return <LoadingView />;

  const currency = wallet?.base_currency ?? 'USD';
  const balance = computeMonthlyBalance(transactions);
  const recent = transactions.slice(0, 5);

  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? 'General';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.iris} />}
    >
      <View style={styles.topRow}>
        <View>
          <Text variant="caption" color={colors.textMuted}>
            Good {greetingLabel()}
          </Text>
          <Text variant="h2">{firstName(session)}</Text>
        </View>
        <View style={styles.topActions}>
          <AnimatedPressable onPress={() => router.push('/notifications')} style={styles.iconBtn}>
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
          </AnimatedPressable>
          <AnimatedPressable onPress={() => router.push('/settings')} style={styles.iconBtn}>
            <Ionicons name="settings-outline" size={22} color={colors.text} />
          </AnimatedPressable>
        </View>
      </View>

      <HeroBalance
        balanceMinor={balance}
        currency={currency}
        subtitle="Income minus expenses this month"
        hideAmount
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickLinks}>
        {[
          { href: '/cashflow', label: 'Cashflow', icon: 'trending-up-outline' as const },
          { href: '/journal', label: 'Journal', icon: 'book-outline' as const },
          { href: '/challenges', label: 'Challenges', icon: 'trophy-outline' as const },
        ].map((link) => (
          <AnimatedPressable key={link.href} onPress={() => router.push(link.href as never)} style={styles.quickLink}>
            <Ionicons name={link.icon} size={16} color={colors.iris} />
            <Text variant="caption" color={colors.iris}>
              {link.label}
            </Text>
          </AnimatedPressable>
        ))}
      </ScrollView>

      <View style={styles.sectionHeader}>
        <Text variant="h3">Recent</Text>
        <AnimatedPressable onPress={() => router.push('/ledger')}>
          <Text variant="label" color={colors.iris}>
            See all
          </Text>
        </AnimatedPressable>
      </View>

      <Card style={styles.card}>
        {recent.length === 0 ? (
          <Text variant="body" color={colors.textSecondary}>
            No transactions yet. Add one or ask Penda.
          </Text>
        ) : (
          recent.map((tx, i) => (
            <TransactionRow
              key={tx.id}
              transaction={tx}
              currency={currency}
              index={i}
              onLongPress={() => confirmDelete(tx)}
            />
          ))
        )}
      </Card>

      {budgetProgress.length > 0 ? (
        <>
          <Text variant="h3" style={styles.sectionTitle}>
            Budgets
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {budgetProgress.slice(0, 4).map((bp) => {
              const progress = bp.effective_amount_minor
                ? bp.spent_minor / bp.effective_amount_minor
                : 0;
              return (
                <Card key={bp.budget_id} style={styles.chip}>
                  <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
                    {categoryName(bp.category_id)}
                  </Text>
                  <Text variant="label" numberOfLines={1}>
                    {formatMoney(bp.spent_minor, currency)} / {formatMoney(bp.effective_amount_minor, currency)}
                  </Text>
                  <ProgressBar progress={progress} overBudget={progress > 1} />
                </Card>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      {goals.length > 0 ? (
        <>
          <Text variant="h3" style={styles.sectionTitle}>
            Goals
          </Text>
          <Card style={styles.card}>
            {goals.slice(0, 3).map((g) => {
              const pct = g.target_amount_minor ? g.current_amount_minor / g.target_amount_minor : 0;
              return (
                <View key={g.id} style={styles.goalRow}>
                  <View style={styles.goalHeader}>
                    <Text variant="bodyMedium">{g.name}</Text>
                    <Badge label={`${Math.round(pct * 100)}%`} tone="mint" />
                  </View>
                  <ProgressBar progress={pct} fillColor={colors.mint} />
                  <Text variant="caption" color={colors.textMuted}>
                    {formatMoney(g.current_amount_minor, currency)} of {formatMoney(g.target_amount_minor, currency)}
                  </Text>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      <View style={styles.chatActions}>
        <AnimatedPressable
          onPress={() => {
            openChat('', { startRecording: true });
            router.push('/chat');
          }}
          style={styles.micFab}
          accessibilityLabel="Talk to Penda"
        >
          <Ionicons name="mic" size={22} color="#FFF" />
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => {
            openChat();
            router.push('/chat');
          }}
          style={styles.chatFab}
        >
          <Ionicons name="sparkles" size={22} color="#FFF" />
          <Text variant="bodyMedium" color="#FFF">
            Ask Penda
          </Text>
        </AnimatedPressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: 140,
    gap: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  topActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    marginTop: spacing.sm,
  },
  card: {
    gap: spacing.xs,
  },
  chips: {
    gap: spacing.md,
    paddingRight: spacing.xl,
  },
  chip: {
    width: 180,
    gap: spacing.sm,
  },
  goalRow: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  micFab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatFab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.iris,
    paddingVertical: spacing.md + 2,
    borderRadius: 999,
  },
  quickLinks: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  quickLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.irisSoft,
  },
});
