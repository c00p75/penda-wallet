import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Card, Screen, LoadingView, Badge } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { HiddenAmount } from '@/src/components/HiddenAmount';
import { colors, spacing } from '@/src/lib/theme';
import { formatMoney } from '@/src/lib/money';
import { fetchTransactions } from '@/src/api/transactions';
import { useCurrentWallet } from '@/src/hooks/useCurrentWallet';
import type { TransactionSource } from '@/src/api/types';

const AUTO_SOURCES: TransactionSource[] = ['sms', 'chat', 'voice', 'receipt'];

const SOURCE_LABELS: Record<string, string> = {
  sms: 'SMS',
  chat: 'Chat',
  voice: 'Voice',
  receipt: 'Receipt',
};

const SOURCE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  sms: 'phone-portrait-outline',
  chat: 'chatbubble-outline',
  voice: 'mic-outline',
  receipt: 'camera-outline',
};

export default function ActivityScreen() {
  const router = useRouter();
  const { wallet, isLoading } = useCurrentWallet();

  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ['transactions', wallet?.id],
    queryFn: () => fetchTransactions(wallet!.id),
    enabled: !!wallet?.id,
  });

  if (isLoading || txLoading) return <LoadingView />;

  const currency = wallet?.base_currency ?? 'USD';
  const autoLogged = transactions
    .filter((tx) => AUTO_SOURCES.includes(tx.source))
    .sort((a, b) => {
      const byDate = b.transaction_date.localeCompare(a.transaction_date);
      if (byDate !== 0) return byDate;
      return b.created_at.localeCompare(a.created_at);
    });

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </AnimatedPressable>
        <Text variant="h2">Activity</Text>
        <View style={styles.spacer} />
      </View>

      <Text variant="body" color={colors.textSecondary} style={styles.subtitle}>
        What Penda added for you
      </Text>

      {autoLogged.length === 0 ? (
        <Text variant="body" color={colors.textSecondary} style={styles.empty}>
          Nothing auto-logged yet. Scan a receipt or tell Penda about a purchase.
        </Text>
      ) : (
        autoLogged.map((tx) => {
          const icon = SOURCE_ICONS[tx.source] ?? 'sparkles-outline';
          const sign = tx.type === 'expense' ? '-' : '+';
          return (
            <Card key={tx.id} style={styles.row}>
              <View style={styles.iconWrap}>
                <Ionicons name={icon} size={18} color={colors.iris} />
              </View>
              <View style={styles.rowBody}>
                <Text variant="bodyMedium">{tx.merchant || tx.description || 'Transaction'}</Text>
                <View style={styles.meta}>
                  <Badge label={SOURCE_LABELS[tx.source] ?? tx.source} tone="iris" />
                  <Text variant="caption" color={colors.textMuted}>
                    {tx.transaction_date}
                  </Text>
                </View>
              </View>
              <HiddenAmount>
                <Text variant="label" color={tx.type === 'expense' ? colors.rose : colors.mint}>
                  {sign}
                  {formatMoney(tx.amount_minor, currency)}
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
    marginBottom: spacing.sm,
  },
  spacer: { width: 22 },
  subtitle: { marginBottom: spacing.lg },
  empty: { textAlign: 'center', marginTop: spacing.xxxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.irisSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
