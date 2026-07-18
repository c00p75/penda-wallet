import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Card, EmptyState, LoadingView, Input, Button } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { ProgressBar } from '@/src/components/ProgressBar';
import { colors, spacing } from '@/src/lib/theme';
import { formatMoney, toMinorUnits } from '@/src/lib/money';
import { localDateStr } from '@/src/lib/dates';
import { addContribution, fetchSavingsGoals } from '@/src/api/goals';
import { useCurrentWallet } from '@/src/hooks/useCurrentWallet';

export default function GoalsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { wallet, isLoading: walletLoading } = useCurrentWallet();
  const [contributingId, setContributingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');

  const { data: goals = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['goals', wallet?.id],
    queryFn: () => fetchSavingsGoals(wallet!.id),
    enabled: !!wallet?.id,
  });

  const contributeMutation = useMutation({
    mutationFn: ({ goalId, amountMinor }: { goalId: string; amountMinor: number }) =>
      addContribution(goalId, amountMinor, localDateStr()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['goals', wallet?.id] });
      setContributingId(null);
      setAmount('');
    },
    onError: (err) => {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to add contribution');
    },
  });

  if (walletLoading || isLoading) return <LoadingView label="Loading goals…" />;

  const currency = wallet?.base_currency ?? 'USD';

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
            Goals
          </Text>
          <Text variant="body" color={colors.textSecondary} style={styles.subtitle}>
            Save toward what matters most.
          </Text>
        </View>
        <AnimatedPressable onPress={() => router.push('/add-goal')} style={styles.addBtn}>
          <Ionicons name="add" size={22} color="#FFF" />
        </AnimatedPressable>
      </View>

      {goals.length === 0 ? (
        <EmptyState
          title="No savings goals yet"
          subtitle="Create a goal, or ask Penda to set one up for you."
          action={{ label: 'Create goal', onPress: () => router.push('/add-goal') }}
        />
      ) : (
        goals.map((goal) => {
          const pct = goal.target_amount_minor
            ? goal.current_amount_minor / goal.target_amount_minor
            : 0;
          const isContributing = contributingId === goal.id;

          return (
            <Card key={goal.id} style={styles.card}>
              <View style={styles.row}>
                <Text variant="h3">{goal.icon ? `${goal.icon} ` : ''}{goal.name}</Text>
                <Text variant="label" color={colors.iris}>
                  {Math.round(pct * 100)}%
                </Text>
              </View>
              {goal.motivation ? (
                <Text variant="small" color={colors.textSecondary}>
                  {goal.motivation}
                </Text>
              ) : null}
              <ProgressBar progress={pct} fillColor={colors.mint} height={10} />
              <Text variant="body" color={colors.textSecondary}>
                {formatMoney(goal.current_amount_minor, currency)} of{' '}
                {formatMoney(goal.target_amount_minor, currency)}
              </Text>

              {isContributing ? (
                <View style={styles.contribForm}>
                  <Input
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="Amount"
                    keyboardType="decimal-pad"
                  />
                  <View style={styles.contribActions}>
                    <Button
                      title="Add"
                      onPress={() => {
                        const parsed = parseFloat(amount);
                        if (!parsed || parsed <= 0) return;
                        contributeMutation.mutate({
                          goalId: goal.id,
                          amountMinor: toMinorUnits(parsed),
                        });
                      }}
                      loading={contributeMutation.isPending}
                      style={styles.contribBtn}
                    />
                    <Button
                      title="Cancel"
                      variant="secondary"
                      onPress={() => {
                        setContributingId(null);
                        setAmount('');
                      }}
                      style={styles.contribBtn}
                    />
                  </View>
                </View>
              ) : (
                <AnimatedPressable onPress={() => setContributingId(goal.id)}>
                  <Text variant="label" color={colors.iris}>
                    + Quick contribution
                  </Text>
                </AnimatedPressable>
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
  contribForm: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  contribActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  contribBtn: {
    flex: 1,
  },
});
