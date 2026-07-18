import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, Card, Input, Screen, LoadingView } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { HiddenAmount } from '@/src/components/HiddenAmount';
import { colors, spacing } from '@/src/lib/theme';
import { formatMoney } from '@/src/lib/money';
import { localDateStr, localMonthPrefix } from '@/src/lib/dates';
import { txEffectiveAmount } from '@/src/lib/transactions';
import { fetchTransactions } from '@/src/api/transactions';
import { fetchDebts } from '@/src/api/debts';
import { fetchProfile, updateProfile } from '@/src/api/profile';
import { useAuthStore } from '@/src/store/authStore';
import { useCurrentWallet } from '@/src/hooks/useCurrentWallet';

export default function BusinessScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const { wallet, isLoading: walletLoading } = useCurrentWallet();
  const [taxDraft, setTaxDraft] = useState<string | null>(null);

  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ['transactions', wallet?.id],
    queryFn: () => fetchTransactions(wallet!.id),
    enabled: !!wallet?.id,
  });

  const { data: debts = [] } = useQuery({
    queryKey: ['debts', wallet?.id],
    queryFn: () => fetchDebts(wallet!.id),
    enabled: !!wallet?.id,
  });

  const { data: profile } = useQuery({
    queryKey: ['profile', session?.user.id],
    queryFn: () => fetchProfile(session!.user.id),
    enabled: !!session?.user.id,
  });

  const updateMut = useMutation({
    mutationFn: (pct: number) => updateProfile(session!.user.id, { tax_reserve_pct: pct }),
    onSuccess: () => {
      setTaxDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['profile', session?.user.id] });
      Alert.alert('Saved', 'Tax reserve updated.');
    },
    onError: (err) => Alert.alert('Error', err instanceof Error ? err.message : 'Could not save'),
  });

  if (walletLoading || txLoading) return <LoadingView />;

  const currency = wallet?.base_currency ?? 'USD';
  const monthPrefix = localMonthPrefix();
  const monthTx = transactions.filter((tx) => tx.transaction_date.startsWith(monthPrefix));
  const monthIncome = monthTx.filter((t) => t.type === 'income').reduce((s, t) => s + txEffectiveAmount(t), 0);
  const monthExpense = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + txEffectiveAmount(t), 0);
  const profit = monthIncome - monthExpense;

  const balance = transactions.reduce((sum, tx) => {
    const amount = txEffectiveAmount(tx);
    if (tx.type === 'income') return sum + amount;
    if (tx.type === 'expense') return sum - amount;
    return sum;
  }, 0);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = localDateStr(cutoff);
  const last30Expense = transactions
    .filter((tx) => tx.type === 'expense' && tx.transaction_date >= cutoffStr)
    .reduce((s, tx) => s + txEffectiveAmount(tx), 0);
  const avgDailyBurn = last30Expense / 30;
  const runwayDays = avgDailyBurn > 0 ? Math.floor(Math.max(0, balance) / avgDailyBurn) : null;

  const receivables = debts.filter((d) => d.direction === 'owed_to_me' && d.balance_minor > 0);
  const arTotal = receivables.reduce((s, d) => s + d.balance_minor, 0);

  const reservePct = profile?.tax_reserve_pct ?? 0;
  const taxSetAside = Math.round((monthIncome * reservePct) / 100);
  const taxInput = taxDraft ?? String(reservePct);

  function saveTax() {
    const n = Number(taxInput);
    if (Number.isNaN(n) || n < 0 || n > 50) {
      Alert.alert('Invalid', 'Tax reserve must be between 0 and 50%.');
      return;
    }
    updateMut.mutate(n);
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </AnimatedPressable>
        <Text variant="h2">Business</Text>
        <View style={styles.spacer} />
      </View>

      <Card style={styles.hero}>
        <Text variant="caption" color={colors.textSecondary}>
          Month profit
        </Text>
        <HiddenAmount>
          <Text variant="h1" color={profit >= 0 ? colors.mint : colors.rose}>
            {formatMoney(profit, currency)}
          </Text>
        </HiddenAmount>
        <Text variant="caption" color={colors.textMuted}>
          Income {formatMoney(monthIncome, currency)} · Expenses {formatMoney(monthExpense, currency)}
        </Text>
      </Card>

      <View style={styles.row}>
        <Card style={styles.stat}>
          <Text variant="caption" color={colors.textMuted}>
            Runway
          </Text>
          <Text variant="h3">{runwayDays != null ? `${runwayDays} days` : 'N/A'}</Text>
        </Card>
        <Card style={styles.stat}>
          <Text variant="caption" color={colors.textMuted}>
            Accounts receivable
          </Text>
          <HiddenAmount>
            <Text variant="h3">{formatMoney(arTotal, currency)}</Text>
          </HiddenAmount>
        </Card>
      </View>

      {receivables.length > 0 ? (
        <>
          <Text variant="h3" style={styles.section}>
            Owed to you
          </Text>
          {receivables.map((d) => (
            <Card key={d.id} style={styles.debtRow}>
              <Text variant="bodyMedium">{d.name}</Text>
              <HiddenAmount>
                <Text variant="label">{formatMoney(d.balance_minor, currency)}</Text>
              </HiddenAmount>
            </Card>
          ))}
        </>
      ) : null}

      <Text variant="h3" style={styles.section}>
        Tax reserve
      </Text>
      <Card style={styles.taxCard}>
        <Text variant="caption" color={colors.textMuted}>
          Set aside this month: {formatMoney(taxSetAside, currency)}
        </Text>
        <View style={styles.taxRow}>
          <Input
            value={taxInput}
            onChangeText={setTaxDraft}
            keyboardType="decimal-pad"
            placeholder="15"
            style={styles.taxInput}
          />
          <Text variant="bodyMedium">%</Text>
          <Button title="Save" onPress={saveTax} loading={updateMut.isPending} style={styles.taxBtn} />
        </View>
      </Card>
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
  hero: { gap: spacing.xs, marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  stat: { flex: 1, gap: spacing.xs },
  section: { marginTop: spacing.md, marginBottom: spacing.sm },
  debtRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  taxCard: { gap: spacing.md },
  taxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  taxInput: { flex: 1 },
  taxBtn: { paddingHorizontal: spacing.lg },
});
