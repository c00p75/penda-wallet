import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Card, Screen, LoadingView } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { HiddenAmount } from '@/src/components/HiddenAmount';
import { colors, radius, spacing } from '@/src/lib/theme';
import { formatMoney } from '@/src/lib/money';
import { localDateStr } from '@/src/lib/dates';
import { txEffectiveAmount } from '@/src/lib/transactions';
import { projectCashflow } from '@/src/lib/cashflowProjection';
import { fetchTransactions } from '@/src/api/transactions';
import { fetchRecurringTransactions } from '@/src/api/recurring';
import { useCurrentWallet } from '@/src/hooks/useCurrentWallet';

const HORIZONS = [
  { value: 7, label: '7d' },
  { value: 14, label: '14d' },
  { value: 30, label: '30d' },
] as const;

function formatDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function CashflowScreen() {
  const router = useRouter();
  const { wallet, isLoading: walletLoading } = useCurrentWallet();
  const [horizon, setHorizon] = useState<number>(30);

  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ['transactions', wallet?.id],
    queryFn: () => fetchTransactions(wallet!.id),
    enabled: !!wallet?.id,
  });

  const { data: recurring = [] } = useQuery({
    queryKey: ['recurring', wallet?.id],
    queryFn: () => fetchRecurringTransactions(wallet!.id),
    enabled: !!wallet?.id,
  });

  const projection = useMemo(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const balance = transactions.reduce((sum, tx) => {
      const amount = txEffectiveAmount(tx);
      if (tx.type === 'income') return sum + amount;
      if (tx.type === 'expense') return sum - amount;
      return sum;
    }, 0);
    const cutoff = new Date(from);
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = localDateStr(cutoff);
    const discretionary = transactions
      .filter((tx) => tx.type === 'expense' && tx.source !== 'recurring' && tx.transaction_date >= cutoffStr)
      .reduce((sum, tx) => sum + txEffectiveAmount(tx), 0);
    return projectCashflow({
      startingBalanceMinor: balance,
      recurring,
      avgDailySpendMinor: Math.round(discretionary / 30),
      from,
      days: horizon,
    });
  }, [transactions, recurring, horizon]);

  if (walletLoading || txLoading) return <LoadingView />;

  const currency = wallet?.base_currency ?? 'USD';
  const endBalance = projection.days.at(-1)?.balanceMinor ?? 0;
  const { lowestBalance, nextIncome, freeBeforeNextIncomeMinor } = projection;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </AnimatedPressable>
        <Text variant="h2">Cashflow</Text>
        <View style={styles.spacer} />
      </View>

      <View style={styles.chips}>
        {HORIZONS.map((h) => (
          <Pressable
            key={h.value}
            onPress={() => setHorizon(h.value)}
            style={[styles.chip, horizon === h.value && styles.chipActive]}
          >
            <Text variant="label" color={horizon === h.value ? '#FFF' : colors.text}>
              {h.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Card style={styles.hero}>
        <Text variant="caption" color={colors.textSecondary}>
          Lowest projected balance
        </Text>
        <HiddenAmount>
          <Text variant="h1" color={lowestBalance.balanceMinor < 0 ? colors.rose : colors.text}>
            {formatMoney(lowestBalance.balanceMinor, currency)}
          </Text>
        </HiddenAmount>
        <Text variant="caption" color={colors.textMuted}>
          on {formatDay(lowestBalance.date)}
        </Text>
      </Card>

      <View style={styles.statsRow}>
        <Card style={styles.stat}>
          <Text variant="caption" color={colors.textMuted}>
            End balance
          </Text>
          <HiddenAmount>
            <Text variant="bodyMedium">{formatMoney(endBalance, currency)}</Text>
          </HiddenAmount>
        </Card>
        <Card style={styles.stat}>
          <Text variant="caption" color={colors.textMuted}>
            Next income
          </Text>
          {nextIncome ? (
            <HiddenAmount>
              <Text variant="bodyMedium">
                {formatMoney(nextIncome.amountMinor, currency)} · {formatDay(nextIncome.date)}
              </Text>
            </HiddenAmount>
          ) : (
            <Text variant="bodyMedium" color={colors.textMuted}>
              None scheduled
            </Text>
          )}
        </Card>
      </View>

      {freeBeforeNextIncomeMinor != null && nextIncome ? (
        <Card>
          <Text variant="body" color={colors.textSecondary}>
            Free before payday:{' '}
            <HiddenAmount>
              <Text variant="bodyMedium" color={freeBeforeNextIncomeMinor < 0 ? colors.rose : colors.mint}>
                {formatMoney(freeBeforeNextIncomeMinor, currency)}
              </Text>
            </HiddenAmount>
          </Text>
        </Card>
      ) : null}

      <Text variant="h3" style={styles.sectionTitle}>
        Day by day
      </Text>
      {projection.days.map((day) => (
        <Card key={day.date} style={styles.dayCard}>
          <View style={styles.dayHeader}>
            <Text variant="bodyMedium">{formatDay(day.date)}</Text>
            <HiddenAmount>
              <Text variant="label" color={day.balanceMinor < 0 ? colors.rose : colors.text}>
                {formatMoney(day.balanceMinor, currency)}
              </Text>
            </HiddenAmount>
          </View>
          {day.events.map((e, i) => (
            <Text key={i} variant="caption" color={colors.textMuted}>
              {e.label}: {formatMoney(Math.abs(e.amountMinor), currency)}
            </Text>
          ))}
        </Card>
      ))}
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
  chips: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.iris, borderColor: colors.iris },
  hero: { gap: spacing.xs, marginBottom: spacing.md },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  stat: { flex: 1, gap: spacing.xs },
  sectionTitle: { marginTop: spacing.md, marginBottom: spacing.sm },
  dayCard: { marginBottom: spacing.sm, gap: spacing.xs },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
