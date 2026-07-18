import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, Input, Screen } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { colors, radius, spacing } from '@/src/lib/theme';
import { toMinorUnits } from '@/src/lib/money';
import { createBudget } from '@/src/api/budgets';
import { fetchCategories } from '@/src/api/categories';
import { useCurrentWallet } from '@/src/hooks/useCurrentWallet';
import type { BudgetPeriod } from '@/src/api/types';

export default function AddBudgetScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { wallet } = useCurrentWallet();

  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [rollover, setRollover] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', wallet?.id],
    queryFn: () => fetchCategories(wallet!.id),
    enabled: !!wallet?.id,
  });

  const mutation = useMutation({
    mutationFn: () => {
      const parsed = parseFloat(amount);
      if (!parsed || parsed <= 0) throw new Error('Enter a valid amount');
      if (!wallet?.id) throw new Error('No wallet selected');
      return createBudget(wallet.id, {
        category_id: categoryId,
        amount_minor: toMinorUnits(parsed),
        period,
        rollover,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['budgetProgress', wallet?.id] });
      void queryClient.invalidateQueries({ queryKey: ['budgets', wallet?.id] });
      router.back();
    },
    onError: (err) => {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create budget');
    },
  });

  const currency = wallet?.base_currency ?? 'USD';

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </AnimatedPressable>
        <Text variant="h2">New budget</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text variant="label" color={colors.textSecondary}>
        Amount ({currency})
      </Text>
      <Input
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
        keyboardType="decimal-pad"
        autoFocus
      />

      <Text variant="label" color={colors.textSecondary} style={styles.section}>
        Period
      </Text>
      <View style={styles.chips}>
        {(['monthly', 'weekly'] as BudgetPeriod[]).map((p) => (
          <Pressable
            key={p}
            onPress={() => setPeriod(p)}
            style={[styles.chip, period === p && styles.chipActive]}
          >
            <Text variant="label" color={period === p ? '#FFF' : colors.text}>
              {p === 'monthly' ? 'Monthly' : 'Weekly'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.switchRow}>
        <View>
          <Text variant="label">Rollover unused</Text>
          <Text variant="caption" color={colors.textMuted}>
            Carry leftover into the next period
          </Text>
        </View>
        <Switch
          value={rollover}
          onValueChange={setRollover}
          trackColor={{ true: colors.iris, false: colors.border }}
        />
      </View>

      <Text variant="label" color={colors.textSecondary} style={styles.section}>
        Category (optional)
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Pressable
          onPress={() => setCategoryId(null)}
          style={[styles.chip, categoryId === null && styles.chipActive]}
        >
          <Text variant="label" color={categoryId === null ? '#FFF' : colors.text}>
            Overall
          </Text>
        </Pressable>
        {categories.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setCategoryId(c.id)}
            style={[styles.chip, categoryId === c.id && styles.chipActive]}
          >
            <Text variant="label" color={categoryId === c.id ? '#FFF' : colors.text}>
              {c.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Button
        title="Create budget"
        onPress={() => mutation.mutate()}
        loading={mutation.isPending}
        style={styles.submit}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  headerSpacer: { width: 24 },
  section: { marginTop: spacing.lg },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  chipActive: {
    backgroundColor: colors.iris,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  submit: {
    marginTop: spacing.xxl,
  },
});
