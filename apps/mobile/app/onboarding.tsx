import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, Button, Input, Screen } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/lib/theme';
import { createWallet } from '@/src/api/wallets';
import { useAuthStore } from '@/src/store/authStore';
import { useWalletStore } from '@/src/store/walletStore';

const CURRENCIES = ['ZMW', 'USD', 'EUR'] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const setActiveWalletId = useWalletStore((s) => s.setActiveWalletId);
  const [name, setName] = useState('Personal');
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('ZMW');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!session?.user.id || !name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const wallet = await createWallet(name.trim(), currency);
      setActiveWalletId(wallet.id);
      // Money-account first-run complete: creating more pockets later must not re-open this.
      try {
        const { supabase } = await import('@/src/lib/supabase');
        await supabase
          .from('profiles')
          .update({ onboarding_completed_at: new Date().toISOString() })
          .eq('id', session.user.id);
      } catch {
        // Best-effort; web gate still works once the column is set elsewhere.
      }
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create wallet');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen scroll>
      <Text variant="hero" style={styles.title}>
        Welcome to Penda
      </Text>
      <Text variant="body" color={colors.textSecondary} style={styles.subtitle}>
        Create your first money account. You can add wallets like Cash or Airtel Money inside it
        next.
      </Text>

      <View style={styles.field}>
        <Text variant="label" color={colors.textSecondary}>
          Money account name
        </Text>
        <Input value={name} onChangeText={setName} placeholder="Personal" />
      </View>

      <View style={styles.field}>
        <Text variant="label" color={colors.textSecondary}>
          Base currency
        </Text>
        <View style={styles.currencyRow}>
          {CURRENCIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCurrency(c)}
              style={[styles.currencyChip, currency === c && styles.currencyChipActive]}
            >
              <Text variant="bodyMedium" color={currency === c ? '#FFF' : colors.text}>
                {c}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {error ? (
        <Text variant="caption" color={colors.rose}>
          {error}
        </Text>
      ) : null}

      <Button
        title="Create money account"
        onPress={() => void handleCreate()}
        loading={loading}
        style={styles.submit}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.xxxl,
    marginBottom: spacing.sm,
  },
  subtitle: {
    marginBottom: spacing.xxxl,
  },
  field: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  currencyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  currencyChip: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  currencyChipActive: {
    backgroundColor: colors.iris,
    borderColor: colors.iris,
  },
  submit: {
    marginTop: spacing.lg,
  },
});
