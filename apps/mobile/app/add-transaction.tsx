import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, Input, Screen } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { colors, radius, spacing } from '@/src/lib/theme';
import { toMinorUnits } from '@/src/lib/money';
import { localDateStr } from '@/src/lib/dates';
import { createTransaction } from '@/src/api/transactions';
import { fetchCategories } from '@/src/api/categories';
import { useCurrentWallet } from '@/src/hooks/useCurrentWallet';
import { useAuthStore } from '@/src/store/authStore';
import type { TransactionSource, TransactionType } from '@/src/api/types';

export default function AddTransactionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    type?: string;
    amount?: string;
    merchant?: string;
    date?: string;
    source?: string;
  }>();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const { wallet } = useCurrentWallet();

  const [type, setType] = useState<TransactionType>(
    (params.type as TransactionType) || 'expense',
  );
  const [amount, setAmount] = useState(params.amount ?? '');
  const [merchant, setMerchant] = useState(params.merchant ?? '');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(params.date ?? localDateStr());
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const source = (params.source as TransactionSource | undefined) ?? 'manual';

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', wallet?.id],
    queryFn: () => fetchCategories(wallet!.id),
    enabled: !!wallet?.id,
  });

  const mutation = useMutation({
    mutationFn: () => {
      const parsed = parseFloat(amount);
      if (!parsed || parsed <= 0) throw new Error('Enter a valid amount');
      if (!wallet?.id || !session?.user.id) throw new Error('Not signed in');
      return createTransaction(wallet.id, session.user.id, {
        type,
        amount_minor: toMinorUnits(parsed),
        currency: wallet.base_currency,
        category_id: categoryId,
        merchant: merchant.trim() || null,
        description: description.trim() || null,
        transaction_date: date,
        source,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions', wallet?.id] });
      router.back();
    },
    onError: (err) => {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save');
    },
  });

  const currency = wallet?.base_currency ?? 'USD';

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </AnimatedPressable>
        <Text variant="h2">Add transaction</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.typeRow}>
        {(['expense', 'income'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setType(t)}
            style={[styles.typeChip, type === t && styles.typeChipActive]}
          >
            <Text variant="bodyMedium" color={type === t ? '#FFF' : colors.text}>
              {t === 'expense' ? 'Expense' : 'Income'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.field}>
        <Text variant="label" color={colors.textSecondary}>
          Amount ({currency})
        </Text>
        <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
      </View>

      <View style={styles.field}>
        <Text variant="label" color={colors.textSecondary}>
          Merchant
        </Text>
        <Input value={merchant} onChangeText={setMerchant} placeholder="Where was it?" />
      </View>

      <View style={styles.field}>
        <Text variant="label" color={colors.textSecondary}>
          Description
        </Text>
        <Input value={description} onChangeText={setDescription} placeholder="Optional note" />
      </View>

      <View style={styles.field}>
        <Text variant="label" color={colors.textSecondary}>
          Date (YYYY-MM-DD)
        </Text>
        <Input value={date} onChangeText={setDate} placeholder="2026-01-15" />
      </View>

      {categories.length > 0 ? (
        <View style={styles.field}>
          <Text variant="label" color={colors.textSecondary}>
            Category
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
            <Pressable
              onPress={() => setCategoryId(null)}
              style={[styles.catChip, categoryId === null && styles.catChipActive]}
            >
              <Text variant="caption" color={categoryId === null ? '#FFF' : colors.text}>
                None
              </Text>
            </Pressable>
            {categories.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setCategoryId(c.id)}
                style={[styles.catChip, categoryId === c.id && styles.catChipActive]}
              >
                <Text variant="caption" color={categoryId === c.id ? '#FFF' : colors.text}>
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <Button
        title="Save transaction"
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
    marginTop: spacing.lg,
  },
  headerSpacer: {
    width: 24,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  typeChip: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  typeChipActive: {
    backgroundColor: colors.iris,
    borderColor: colors.iris,
  },
  field: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  categories: {
    gap: spacing.sm,
  },
  catChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMuted,
  },
  catChipActive: {
    backgroundColor: colors.iris,
  },
  submit: {
    marginTop: spacing.md,
  },
});
