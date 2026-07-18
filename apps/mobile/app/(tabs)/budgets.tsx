import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Card, EmptyState, LoadingView } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { ProgressBar } from '@/src/components/ProgressBar';
import { colors, spacing } from '@/src/lib/theme';
import { formatMoney } from '@/src/lib/money';
import { fetchBudgetProgress } from '@/src/api/budgets';
import { fetchCategories } from '@/src/api/categories';
import { useCurrentWallet } from '@/src/hooks/useCurrentWallet';

export default function BudgetsScreen() {
  const router = useRouter();
  const { wallet, isLoading: walletLoading } = useCurrentWallet();

  const { data: progress = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['budgetProgress', wallet?.id],
    queryFn: () => fetchBudgetProgress(wallet!.id),
    enabled: !!wallet?.id,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', wallet?.id],
    queryFn: () => fetchCategories(wallet!.id),
    enabled: !!wallet?.id,
  });

  if (walletLoading || isLoading) return <LoadingView label="Loading budgets…" />;

  const currency = wallet?.base_currency ?? 'USD';
  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? 'Overall';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.iris} />
      }
    >
      <View style={styles.titleRow}>
        <View style={styles.titleBlock}>
          <Text variant="h1" style={styles.title}>
            Budgets
          </Text>
          <Text variant="body" color={colors.textSecondary} style={styles.subtitle}>
            Track spending against your limits this period.
          </Text>
        </View>
        <AnimatedPressable onPress={() => router.push('/add-budget')} style={styles.addBtn}>
          <Ionicons name="add" size={22} color="#FFF" />
        </AnimatedPressable>
      </View>

      {progress.length === 0 ? (
        <EmptyState
          title="No budgets yet"
          subtitle="Create a spending limit, or ask Penda to set one up for you."
          action={{ label: 'Create budget', onPress: () => router.push('/add-budget') }}
        />
      ) : (
        progress.map((bp) => {
          const ratio = bp.effective_amount_minor
            ? bp.spent_minor / bp.effective_amount_minor
            : 0;
          return (
            <Card key={bp.budget_id} style={styles.card}>
              <View style={styles.row}>
                <Text variant="h3">{categoryName(bp.category_id)}</Text>
                <Text variant="caption" color={colors.textMuted}>
                  {bp.period}
                </Text>
              </View>
              <Text variant="body" color={colors.textSecondary}>
                {formatMoney(bp.spent_minor, currency)} of {formatMoney(bp.effective_amount_minor, currency)}
              </Text>
              <ProgressBar progress={ratio} overBudget={ratio > 1} />
              {ratio > 1 ? (
                <Text variant="caption" color={colors.rose}>
                  Over budget by {formatMoney(bp.spent_minor - bp.effective_amount_minor, currency)}
                </Text>
              ) : (
                <Text variant="caption" color={colors.mint}>
                  {formatMoney(bp.effective_amount_minor - bp.spent_minor, currency)} remaining
                </Text>
              )}
            </Card>
          );
        })
      )}
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    marginTop: spacing.sm,
  },
  subtitle: {
    marginBottom: spacing.sm,
  },
  addBtn: {
    marginTop: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.iris,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
