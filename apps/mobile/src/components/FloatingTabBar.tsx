import { View, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { Text } from '@/src/components/ui';
import { colors, radius, shadows, spacing } from '@/src/lib/theme';

type TabKey = 'index' | 'budgets' | 'goals' | 'analytics';

interface TabRoute {
  key: string;
  name: string;
}

interface FloatingTabBarProps {
  state: { index: number; routes: TabRoute[] };
  navigation: { navigate: (name: string) => void };
}

const TAB_CONFIG: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'index', label: 'Home', icon: 'home' },
  { key: 'budgets', label: 'Budgets', icon: 'pie-chart' },
  { key: 'goals', label: 'Goals', icon: 'flag' },
  { key: 'analytics', label: 'Analytics', icon: 'bar-chart' },
];

export function FloatingTabBar({ state, navigation }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const leftTabs = TAB_CONFIG.slice(0, 2);
  const rightTabs = TAB_CONFIG.slice(2);

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <View style={styles.bar}>
        <View style={styles.side}>
          {leftTabs.map((tab) => {
            const routeIndex = state.routes.findIndex((r: TabRoute) => r.name === tab.key);
            const focused = state.index === routeIndex;
            return (
              <TabItem
                key={tab.key}
                label={tab.label}
                icon={tab.icon}
                focused={focused}
                onPress={() => navigation.navigate(tab.key)}
              />
            );
          })}
        </View>

        <View style={styles.centerSlot}>
          <AnimatedPressable
            onPress={() => router.push('/chat')}
            style={styles.orbPressable}
            scaleTo={0.92}
          >
            <Animated.View style={[styles.orbWrap, orbStyle]}>
              <LinearGradient colors={[colors.iris, '#7B6FF0']} style={styles.orb}>
                <Ionicons name="sparkles" size={26} color="#FFF" />
              </LinearGradient>
            </Animated.View>
            <Text variant="caption" color={colors.iris} style={styles.orbLabel}>
              Ask Penda
            </Text>
          </AnimatedPressable>
        </View>

        <View style={styles.side}>
          {rightTabs.map((tab) => {
            const routeIndex = state.routes.findIndex((r: TabRoute) => r.name === tab.key);
            const focused = state.index === routeIndex;
            return (
              <TabItem
                key={tab.key}
                label={tab.label}
                icon={tab.icon}
                focused={focused}
                onPress={() => navigation.navigate(tab.key)}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

function TabItem({
  label,
  icon,
  focused,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable onPress={onPress} style={styles.tab} scaleTo={0.94}>
      <Ionicons name={icon} size={22} color={focused ? colors.iris : colors.textMuted} />
      <Text variant="caption" color={focused ? colors.iris : colors.textMuted}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    ...shadows.medium,
    borderWidth: Platform.OS === 'ios' ? 0.5 : 0,
    borderColor: colors.border,
  },
  side: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  centerSlot: {
    width: 88,
    alignItems: 'center',
    marginTop: -28,
  },
  orbPressable: {
    alignItems: 'center',
    gap: 4,
  },
  orbWrap: {
    ...shadows.iris,
  },
  orb: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.surface,
  },
  orbLabel: {
    marginTop: 2,
    fontWeight: '600',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.xs,
  },
});
