import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Text } from '@/src/components/ui';
import { HiddenAmount } from '@/src/components/HiddenAmount';
import { colors, radius, shadows, spacing } from '@/src/lib/theme';
import { formatMoney } from '@/src/lib/money';

interface HeroBalanceProps {
  balanceMinor: number;
  currency: string;
  label?: string;
  subtitle?: string;
  hideAmount?: boolean;
}

function Sparkle({ size, style }: { size: number; style?: object }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      <Path
        d="M12 0c.9 6.6 4.5 10.2 12 12-7.5 1.8-11.1 5.4-12 12-.9-6.6-4.5-10.2-12-12 7.5-1.8 11.1-5.4 12-12Z"
        fill={colors.iris}
        opacity={0.85}
      />
    </Svg>
  );
}

export function HeroBalance({ balanceMinor, currency, label = 'This month', subtitle, hideAmount }: HeroBalanceProps) {
  const floatY = useSharedValue(0);
  const sparkleRotate = useSharedValue(0);

  useEffect(() => {
    floatY.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    sparkleRotate.value = withRepeat(
      withTiming(360, { duration: 8000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [floatY, sparkleRotate]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
  }));

  const sparkleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sparkleRotate.value}deg` }],
  }));

  const isNegative = balanceMinor < 0;

  return (
    <Animated.View style={[styles.wrapper, cardStyle]}>
      <LinearGradient
        colors={[colors.heroStart, colors.heroMid, colors.heroEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <Animated.View style={[styles.sparkleTop, sparkleStyle]}>
          <Sparkle size={18} />
        </Animated.View>
        <Sparkle size={12} style={styles.sparkleSmall} />

        <Text variant="label" color={colors.textSecondary}>
          {label}
        </Text>
        {hideAmount ? (
          <HiddenAmount>
            <Text variant="hero" color={isNegative ? colors.rose : colors.text} style={styles.balance}>
              {formatMoney(balanceMinor, currency)}
            </Text>
          </HiddenAmount>
        ) : (
          <Text
            variant="hero"
            color={isNegative ? colors.rose : colors.text}
            style={styles.balance}
          >
            {formatMoney(balanceMinor, currency)}
          </Text>
        )}
        {subtitle ? (
          <Text variant="small" color={colors.textSecondary}>
            {subtitle}
          </Text>
        ) : null}

        <View style={styles.sparkleBottom}>
          <Sparkle size={48} />
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadows.medium,
  },
  gradient: {
    padding: spacing.xxl,
    minHeight: 160,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(91, 79, 232, 0.08)',
  },
  balance: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sparkleTop: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.xl,
  },
  sparkleSmall: {
    position: 'absolute',
    top: spacing.xxxl,
    right: spacing.xxxl + 8,
    opacity: 0.6,
  },
  sparkleBottom: {
    position: 'absolute',
    bottom: -8,
    right: spacing.lg,
    opacity: 0.15,
  },
});
