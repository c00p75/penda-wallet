import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Card, Input, Screen, LoadingView, Badge } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { HiddenAmount } from '@/src/components/HiddenAmount';
import { colors, spacing } from '@/src/lib/theme';
import { formatMoney, toMinorUnits } from '@/src/lib/money';
import { localDateStr } from '@/src/lib/dates';
import { txEffectiveAmount } from '@/src/lib/transactions';
import { simulateScenario } from '@/src/lib/simulate';
import type { ProjectCashflowInput } from '@/src/lib/cashflowProjection';
import { fetchTransactions } from '@/src/api/transactions';
import { fetchRecurringTransactions } from '@/src/api/recurring';
import { useCurrentWallet } from '@/src/hooks/useCurrentWallet';

const HORIZON_DAYS = 30;

export default function SimulatorScreen() {
  const router = useRouter();
  const { wallet, isLoading: walletLoading } = useCurrentWallet();
  const [purchase, setPurchase] = useState('');
  const [cutPct, setCutPct] = useState(0);
  const [extraPayment, setExtraPayment] = useState('');

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

  const base: ProjectCashflowInput = useMemo(() => {
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
    return {
      startingBalanceMinor: balance,
      recurring,
      avgDailySpendMinor: Math.round(discretionary / 30),
      from,
      days: HORIZON_DAYS,
    };
  }, [transactions, recurring]);

  if (walletLoading || txLoading) return <LoadingView />;

  const currency = wallet?.base_currency ?? 'USD';
  const oneOffMinor = toMinorUnits(Number(purchase) || 0);
  const extraDebtPaymentMinor = toMinorUnits(Number(extraPayment) || 0);
  const result = simulateScenario(base, { oneOffMinor, spendCutPct: cutPct, extraDebtPaymentMinor });

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </AnimatedPressable>
        <Text variant="h2">Simulator</Text>
        <View style={styles.spacer} />
      </View>

      <Card style={styles.result}>
        <Badge label={result.canAfford ? 'Can afford' : 'Shortfall risk'} tone={result.canAfford ? 'mint' : 'rose'} />
        <Text variant="caption" color={colors.textMuted} style={styles.resultLabel}>
          Lowest balance change over {HORIZON_DAYS} days
        </Text>
        <HiddenAmount>
          <Text variant="h2" color={result.lowestDeltaMinor >= 0 ? colors.mint : colors.rose}>
            {result.lowestDeltaMinor >= 0 ? '+' : ''}
            {formatMoney(result.lowestDeltaMinor, currency)}
          </Text>
        </HiddenAmount>
        <Text variant="caption" color={colors.textMuted}>
          End balance delta:{' '}
          <HiddenAmount>
            <Text variant="bodyMedium">
              {result.endDeltaMinor >= 0 ? '+' : ''}
              {formatMoney(result.endDeltaMinor, currency)}
            </Text>
          </HiddenAmount>
        </Text>
      </Card>

      <View style={styles.field}>
        <Text variant="label" color={colors.textSecondary}>
          One-off purchase ({currency})
        </Text>
        <Input value={purchase} onChangeText={setPurchase} keyboardType="decimal-pad" placeholder="0.00" />
      </View>

      <View style={styles.field}>
        <Text variant="label" color={colors.textSecondary}>
          Cut everyday spend by {cutPct}%
        </Text>
        <View style={styles.cutRow}>
          {[0, 10, 20, 30, 50].map((p) => (
            <AnimatedPressable
              key={p}
              onPress={() => setCutPct(p)}
              style={[styles.cutChip, cutPct === p && styles.cutChipActive]}
            >
              <Text variant="caption" color={cutPct === p ? '#FFF' : colors.text}>
                {p}%
              </Text>
            </AnimatedPressable>
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <Text variant="label" color={colors.textSecondary}>
          Extra debt payment this month ({currency})
        </Text>
        <Input value={extraPayment} onChangeText={setExtraPayment} keyboardType="decimal-pad" placeholder="0.00" />
      </View>
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
  result: { gap: spacing.sm, marginBottom: spacing.xl },
  resultLabel: { marginTop: spacing.xs },
  field: { gap: spacing.sm, marginBottom: spacing.lg },
  cutRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cutChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
  },
  cutChipActive: { backgroundColor: colors.iris },
});
