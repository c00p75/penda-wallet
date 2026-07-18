import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, Card, Screen, LoadingView } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { HiddenAmount } from '@/src/components/HiddenAmount';
import { colors, spacing } from '@/src/lib/theme';
import { formatMoney } from '@/src/lib/money';
import { netBalances, openPairDebts } from '@/src/lib/splitBalances';
import { fetchWalletMembers } from '@/src/api/wallets';
import { fetchWalletSplits, markSharesSettled, recordSettlementPayment } from '@/src/api/splits';
import { useAuthStore } from '@/src/store/authStore';
import { useCurrentWallet } from '@/src/hooks/useCurrentWallet';

export default function SettleUpScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const { wallet, isLoading: walletLoading } = useCurrentWallet();

  const { data: members = [] } = useQuery({
    queryKey: ['walletMembers', wallet?.id],
    queryFn: () => fetchWalletMembers(wallet!.id),
    enabled: !!wallet?.id,
  });

  const { data: splits = [], isLoading } = useQuery({
    queryKey: ['splits', wallet?.id],
    queryFn: () => fetchWalletSplits(wallet!.id),
    enabled: !!wallet?.id,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['splits', wallet?.id] });

  const settleMut = useMutation({
    mutationFn: (shareIds: string[]) => markSharesSettled(shareIds),
    onSuccess: () => {
      invalidate();
      Alert.alert('Done', 'Marked settled.');
    },
    onError: (err) => Alert.alert('Error', err instanceof Error ? err.message : 'Could not update'),
  });

  const payMut = useMutation({
    mutationFn: (pair: { fromUserId: string; toUserId: string; amountMinor: number; shareIds: string[] }) =>
      recordSettlementPayment({
        walletId: wallet!.id,
        userId: session!.user.id,
        currency: wallet!.base_currency,
        amountMinor: pair.amountMinor,
        fromUserId: pair.fromUserId,
        toLabel: labelFor(pair.toUserId),
        shareIds: pair.shareIds,
      }),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['transactions', wallet?.id] });
      Alert.alert('Done', 'Settlement recorded.');
    },
    onError: (err) => Alert.alert('Error', err instanceof Error ? err.message : 'Could not record'),
  });

  if (walletLoading || isLoading) return <LoadingView />;

  const currency = wallet?.base_currency ?? 'USD';

  function labelFor(userId: string) {
    return (
      members.find((m) => m.user_id === userId)?.display_name?.trim() ||
      members.find((m) => m.user_id === userId)?.email ||
      'Member'
    );
  }

  const nets = netBalances(splits);
  const pairs = openPairDebts(splits);

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </AnimatedPressable>
        <Text variant="h2">Settle up</Text>
        <View style={styles.spacer} />
      </View>

      {members.length < 2 ? (
        <Text variant="body" color={colors.textSecondary} style={styles.empty}>
          Invite someone to this wallet to split and settle expenses.
        </Text>
      ) : pairs.length === 0 ? (
        <Text variant="body" color={colors.textSecondary} style={styles.empty}>
          Everyone is settled. Split an expense from the ledger to track who owes whom.
        </Text>
      ) : (
        <>
          <Text variant="h3" style={styles.section}>
            Net positions
          </Text>
          {nets.map((n) => (
            <Card key={n.userId} style={styles.row}>
              <View>
                <Text variant="bodyMedium">{labelFor(n.userId)}</Text>
                <Text variant="caption" color={colors.textMuted}>
                  {n.netMinor > 0 ? 'Is owed overall' : 'Owes overall'}
                </Text>
              </View>
              <HiddenAmount>
                <Text variant="label" color={n.netMinor > 0 ? colors.mint : colors.rose}>
                  {n.netMinor > 0 ? '+' : ''}
                  {formatMoney(n.netMinor, currency)}
                </Text>
              </HiddenAmount>
            </Card>
          ))}

          <Text variant="h3" style={styles.section}>
            Open debts
          </Text>
          {pairs.map((p) => (
            <Card key={`${p.fromUserId}-${p.toUserId}`} style={styles.pair}>
              <Text variant="bodyMedium">
                {labelFor(p.fromUserId)} owes {labelFor(p.toUserId)}
              </Text>
              <HiddenAmount>
                <Text variant="h3">{formatMoney(p.amountMinor, currency)}</Text>
              </HiddenAmount>
              <View style={styles.pairActions}>
                <Button
                  title="Mark settled"
                  variant="secondary"
                  onPress={() => settleMut.mutate(p.shareIds)}
                  style={styles.pairBtn}
                />
                <Button
                  title="Record payment"
                  onPress={() => payMut.mutate(p)}
                  style={styles.pairBtn}
                />
              </View>
            </Card>
          ))}
        </>
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
  section: { marginTop: spacing.md, marginBottom: spacing.sm },
  empty: { textAlign: 'center', marginTop: spacing.xxxl },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  pair: { marginBottom: spacing.md, gap: spacing.sm },
  pairActions: { flexDirection: 'row', gap: spacing.sm },
  pairBtn: { flex: 1 },
});
