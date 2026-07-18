import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Card, Screen, LoadingView, Badge } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { HiddenAmount } from '@/src/components/HiddenAmount';
import { ProgressBar } from '@/src/components/ProgressBar';
import { colors, spacing } from '@/src/lib/theme';
import { formatMoney } from '@/src/lib/money';
import { localMonthStart } from '@/src/lib/dates';
import { fetchWalletMembers } from '@/src/api/wallets';
import { fetchSpendingPlan, fetchPlanShares } from '@/src/api/planning';
import { fetchSavingsGoals } from '@/src/api/goals';
import { useCurrentWallet } from '@/src/hooks/useCurrentWallet';

export default function FamilyScreen() {
  const router = useRouter();
  const { wallet, isLoading: walletLoading } = useCurrentWallet();
  const monthStart = localMonthStart();

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['walletMembers', wallet?.id],
    queryFn: () => fetchWalletMembers(wallet!.id),
    enabled: !!wallet?.id,
  });

  const { data: plan } = useQuery({
    queryKey: ['spendingPlan', wallet?.id, monthStart],
    queryFn: () => fetchSpendingPlan(wallet!.id, monthStart),
    enabled: !!wallet?.id,
  });

  const { data: shares = [] } = useQuery({
    queryKey: ['planShares', plan?.id],
    queryFn: () => fetchPlanShares(plan!.id),
    enabled: !!plan?.id,
  });

  const { data: goals = [] } = useQuery({
    queryKey: ['goals', wallet?.id],
    queryFn: () => fetchSavingsGoals(wallet!.id),
    enabled: !!wallet?.id,
  });

  if (walletLoading || membersLoading) return <LoadingView />;

  const currency = wallet?.base_currency ?? 'USD';
  const allowances = goals.filter((g) => /allowance|pocket|kids?/i.test(g.name));

  const labelFor = (userId: string) =>
    members.find((m) => m.user_id === userId)?.display_name?.trim() ||
    members.find((m) => m.user_id === userId)?.email ||
    'Member';

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </AnimatedPressable>
        <Text variant="h2">Family</Text>
        <View style={styles.spacer} />
      </View>

      <Text variant="h3" style={styles.section}>
        Members
      </Text>
      {members.length === 0 ? (
        <Text variant="body" color={colors.textSecondary}>
          No members yet.
        </Text>
      ) : (
        members.map((m) => (
          <Card key={m.user_id} style={styles.memberRow}>
            <View>
              <Text variant="bodyMedium">{labelFor(m.user_id)}</Text>
              <Text variant="caption" color={colors.textMuted}>
                {m.role}
              </Text>
            </View>
          </Card>
        ))
      )}

      <Text variant="h3" style={styles.section}>
        Spending plan
      </Text>
      {plan ? (
        <Card style={styles.planCard}>
          <Text variant="caption" color={colors.textMuted}>
            {monthStart.slice(0, 7)}
          </Text>
          <HiddenAmount>
            <Text variant="h2">{formatMoney(plan.intended_amount_minor, currency)}</Text>
          </HiddenAmount>
          {plan.reflection ? (
            <Text variant="body" color={colors.textSecondary}>
              {plan.reflection}
            </Text>
          ) : null}
          {shares.length > 0 ? (
            <>
              <Text variant="label" style={styles.shareTitle}>
                Allocations
              </Text>
              {shares.map((s) => (
                <View key={s.member_id} style={styles.shareRow}>
                  <Text variant="bodyMedium">{labelFor(s.member_id)}</Text>
                  <HiddenAmount>
                    <Text variant="label">{formatMoney(s.allocated_minor, currency)}</Text>
                  </HiddenAmount>
                </View>
              ))}
            </>
          ) : null}
        </Card>
      ) : (
        <Text variant="body" color={colors.textSecondary}>
          No spending plan for this month yet.
        </Text>
      )}

      <Text variant="h3" style={styles.section}>
        Allowance goals
      </Text>
      {allowances.length === 0 ? (
        <Text variant="body" color={colors.textSecondary}>
          No allowance goals found. Name a goal with "allowance" or "pocket".
        </Text>
      ) : (
        allowances.map((g) => {
          const pct = g.target_amount_minor ? g.current_amount_minor / g.target_amount_minor : 0;
          return (
            <Card key={g.id} style={styles.goalCard}>
              <View style={styles.goalHeader}>
                <Text variant="bodyMedium">{g.name}</Text>
                <Badge label={`${Math.round(pct * 100)}%`} tone="mint" />
              </View>
              <ProgressBar progress={pct} fillColor={colors.mint} />
              <HiddenAmount>
                <Text variant="caption" color={colors.textMuted}>
                  {formatMoney(g.current_amount_minor, currency)} of {formatMoney(g.target_amount_minor, currency)}
                </Text>
              </HiddenAmount>
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
  section: { marginTop: spacing.md, marginBottom: spacing.sm },
  memberRow: { marginBottom: spacing.sm },
  planCard: { gap: spacing.sm },
  shareTitle: { marginTop: spacing.sm },
  shareRow: { flexDirection: 'row', justifyContent: 'space-between' },
  goalCard: { marginBottom: spacing.sm, gap: spacing.sm },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
