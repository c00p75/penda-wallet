import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, Input, Screen } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { colors, spacing } from '@/src/lib/theme';
import { toMinorUnits } from '@/src/lib/money';
import { createSavingsGoal } from '@/src/api/goals';
import { useCurrentWallet } from '@/src/hooks/useCurrentWallet';

const ICONS = ['🎯', '🏠', '✈️', '🚗', '💻', '🎓', '💪', '🎁'];

export default function AddGoalScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { wallet } = useCurrentWallet();

  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [initial, setInitial] = useState('');
  const [motivation, setMotivation] = useState('');
  const [icon, setIcon] = useState<string | null>('🎯');

  const mutation = useMutation({
    mutationFn: () => {
      const targetParsed = parseFloat(target);
      if (!name.trim()) throw new Error('Give your goal a name');
      if (!targetParsed || targetParsed <= 0) throw new Error('Enter a valid target amount');
      if (!wallet?.id) throw new Error('No wallet selected');
      const initialParsed = parseFloat(initial) || 0;
      return createSavingsGoal(
        wallet.id,
        {
          name: name.trim(),
          icon,
          image_path: null,
          target_amount_minor: toMinorUnits(targetParsed),
          target_date: null,
          motivation: motivation.trim() || null,
        },
        toMinorUnits(Math.max(0, initialParsed)),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['goals', wallet?.id] });
      router.back();
    },
    onError: (err) => {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create goal');
    },
  });

  const currency = wallet?.base_currency ?? 'USD';

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </AnimatedPressable>
        <Text variant="h2">New goal</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text variant="label" color={colors.textSecondary}>
        Icon
      </Text>
      <View style={styles.icons}>
        {ICONS.map((i) => (
          <AnimatedPressable
            key={i}
            onPress={() => setIcon(i)}
            style={[styles.iconChip, icon === i && styles.iconChipActive]}
          >
            <Text variant="h3">{i}</Text>
          </AnimatedPressable>
        ))}
      </View>

      <Text variant="label" color={colors.textSecondary} style={styles.section}>
        Name
      </Text>
      <Input value={name} onChangeText={setName} placeholder="Emergency fund" autoFocus />

      <Text variant="label" color={colors.textSecondary} style={styles.section}>
        Target ({currency})
      </Text>
      <Input value={target} onChangeText={setTarget} placeholder="1000" keyboardType="decimal-pad" />

      <Text variant="label" color={colors.textSecondary} style={styles.section}>
        Starting amount (optional)
      </Text>
      <Input value={initial} onChangeText={setInitial} placeholder="0" keyboardType="decimal-pad" />

      <Text variant="label" color={colors.textSecondary} style={styles.section}>
        Why it matters
      </Text>
      <Input
        value={motivation}
        onChangeText={setMotivation}
        placeholder="Peace of mind for rainy days"
      />

      <Button
        title="Create goal"
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
  icons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  iconChip: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  iconChipActive: {
    backgroundColor: colors.irisSoft,
    borderWidth: 2,
    borderColor: colors.iris,
  },
  submit: {
    marginTop: spacing.xxl,
  },
});
