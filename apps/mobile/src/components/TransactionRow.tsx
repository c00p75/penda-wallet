import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/lib/theme';
import { formatMoney } from '@/src/lib/money';
import type { Transaction } from '@/src/api/types';

interface TransactionRowProps {
  transaction: Transaction;
  currency: string;
  index?: number;
  onPress?: () => void;
  onLongPress?: () => void;
}

export function TransactionRow({
  transaction,
  currency,
  index = 0,
  onPress,
  onLongPress,
}: TransactionRowProps) {
  const isIncome = transaction.type === 'income';
  const amount = transaction.converted_amount_minor ?? transaction.amount_minor;
  const displayCurrency = transaction.currency || currency;
  const title = transaction.merchant || transaction.description || transaction.category?.name || 'Transaction';
  const subtitle = transaction.category?.name ?? transaction.transaction_date;

  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
    >
      <Animated.View
        entering={FadeInDown.delay(index * 40).springify().damping(18)}
        style={styles.row}
      >
        <View style={[styles.icon, { backgroundColor: isIncome ? colors.mintSoft : colors.apricotSoft }]}>
          <Ionicons
            name={isIncome ? 'arrow-down' : 'arrow-up'}
            size={18}
            color={isIncome ? colors.mint : colors.apricot}
          />
        </View>
        <View style={styles.content}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Text variant="bodyMedium" color={isIncome ? colors.mint : colors.text}>
          {isIncome ? '+' : '-'}
          {formatMoney(amount, displayCurrency)}
        </Text>
      </Animated.View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 2,
  },
});
