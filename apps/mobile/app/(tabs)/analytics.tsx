import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, Card, LoadingView } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { ProgressBar } from '@/src/components/ProgressBar';
import { colors, spacing } from '@/src/lib/theme';
import { formatMoney } from '@/src/lib/money';
import { fetchTransactions } from '@/src/api/transactions';
import { fetchInsights, dismissInsight } from '@/src/api/insights';
import { useCurrentWallet } from '@/src/hooks/useCurrentWallet';
import { categoryBreakdown, computeMonthlyTotals } from '@/src/lib/transactions';

export default function AnalyticsScreen() {
  const queryClient = useQueryClient();
  const { wallet, isLoading: walletLoading } = useCurrentWallet();

  const { data: transactions = [], isLoading: txLoading, refetch: refetchTx, isRefetching: txRefetching } = useQuery({
    queryKey: ['transactions', wallet?.id],
    queryFn: () => fetchTransactions(wallet!.id),
    enabled: !!wallet?.id,
  });

  const { data: insights = [], refetch: refetchInsights, isRefetching: insightsRefetching } = useQuery({
    queryKey: ['insights', wallet?.id],
    queryFn: () => fetchInsights(wallet!.id),
    enabled: !!wallet?.id,
  });

  const dismissMutation = useMutation({
    mutationFn: dismissInsight,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['insights', wallet?.id] }),
  });

  if (walletLoading || txLoading) return <LoadingView label="Loading analytics…" />;

  const currency = wallet?.base_currency ?? 'USD';
  const { incomeMinor, expenseMinor } = computeMonthlyTotals(transactions);
  const breakdown = [...categoryBreakdown(transactions).entries()].sort((a, b) => b[1] - a[1]);
  const maxCategory = breakdown[0]?.[1] ?? 1;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={txRefetching || insightsRefetching}
          onRefresh={() => {
            void refetchTx();
            void refetchInsights();
          }}
          tintColor={colors.iris}
        />
      }
    >
      <Text variant="h1" style={styles.title}>
        Analytics
      </Text>
      <Text variant="body" color={colors.textSecondary} style={styles.subtitle}>
        This month at a glance.
      </Text>

      <View style={styles.summaryRow}>
        <Card style={styles.summaryCard}>
          <Text variant="caption" color={colors.textMuted}>
            Income
          </Text>
          <Text variant="h2" color={colors.mint}>
            {formatMoney(incomeMinor, currency)}
          </Text>
        </Card>
        <Card style={styles.summaryCard}>
          <Text variant="caption" color={colors.textMuted}>
            Spent
          </Text>
          <Text variant="h2" color={colors.apricot}>
            {formatMoney(expenseMinor, currency)}
          </Text>
        </Card>
      </View>

      <Card style={styles.card}>
        <Text variant="h3" style={styles.cardTitle}>
          Net this month
        </Text>
        <Text variant="hero" color={incomeMinor - expenseMinor >= 0 ? colors.mint : colors.rose}>
          {formatMoney(incomeMinor - expenseMinor, currency)}
        </Text>
      </Card>

      {breakdown.length > 0 ? (
        <>
          <Text variant="h3">By category</Text>
          <Card style={styles.card}>
            {breakdown.map(([name, amount]) => (
              <View key={name} style={styles.categoryRow}>
                <View style={styles.categoryHeader}>
                  <Text variant="bodyMedium">{name}</Text>
                  <Text variant="small" color={colors.textSecondary}>
                    {formatMoney(amount, currency)}
                  </Text>
                </View>
                <ProgressBar progress={amount / maxCategory} fillColor={colors.apricot} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {insights.length > 0 ? (
        <>
          <Text variant="h3">Insights</Text>
          {insights.map((insight) => (
            <Card key={insight.id} style={styles.insightCard}>
              <Text variant="body">{insight.content.text}</Text>
              <AnimatedPressable onPress={() => dismissMutation.mutate(insight.id)}>
                <Text variant="caption" color={colors.textMuted}>
                  Dismiss
                </Text>
              </AnimatedPressable>
            </Card>
          ))}
        </>
      ) : null}
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
  title: {
    marginTop: spacing.sm,
  },
  subtitle: {
    marginBottom: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  summaryCard: {
    flex: 1,
    gap: spacing.xs,
  },
  card: {
    gap: spacing.md,
  },
  cardTitle: {
    marginBottom: spacing.xs,
  },
  categoryRow: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  insightCard: {
    gap: spacing.sm,
  },
});
