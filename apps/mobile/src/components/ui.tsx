import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewProps,
  Text as RNText,
  TextProps as RNTextProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing, typography } from '@/src/lib/theme';

type TextVariant = keyof typeof typography;

const fontFamily: Record<TextVariant, string> = {
  hero: 'Outfit_700Bold',
  h1: 'Outfit_700Bold',
  h2: 'Outfit_600SemiBold',
  h3: 'Outfit_600SemiBold',
  body: 'Outfit_400Regular',
  bodyMedium: 'Outfit_500Medium',
  small: 'Outfit_400Regular',
  caption: 'Outfit_500Medium',
  label: 'Outfit_600SemiBold',
};

export function Text({
  variant = 'body',
  color = colors.text,
  style,
  ...props
}: RNTextProps & { variant?: TextVariant; color?: string }) {
  return <RNText style={[typography[variant], { color, fontFamily: fontFamily[variant] }, style]} {...props} />;
}

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewProps['style'];
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: ButtonProps) {
  const variantStyle = buttonVariants[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        variantStyle.container,
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyle.textColor} />
      ) : (
        <Text variant="bodyMedium" color={variantStyle.textColor}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const buttonVariants = {
  primary: { container: { backgroundColor: colors.iris }, textColor: '#FFF' },
  secondary: { container: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, textColor: colors.text },
  ghost: { container: { backgroundColor: 'transparent' }, textColor: colors.iris },
  danger: { container: { backgroundColor: colors.roseSoft }, textColor: colors.rose },
};

export function Card({ style, children, ...props }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
}

interface ScreenProps extends ViewProps {
  scroll?: boolean;
  padded?: boolean;
}

export function Screen({ scroll, padded = true, style, children, ...props }: ScreenProps) {
  const content = (
    <View style={[padded && styles.screenPadding, style]} {...props}>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function Input({ style, ...props }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      style={[styles.input, style]}
      {...props}
    />
  );
}

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ title, subtitle, action }: EmptyStateProps) {
  return (
    <View style={styles.empty}>
      <Text variant="h3">{title}</Text>
      {subtitle ? (
        <Text variant="small" color={colors.textSecondary} style={styles.emptySubtitle}>
          {subtitle}
        </Text>
      ) : null}
      {action ? <Button title={action.label} onPress={action.onPress} style={styles.emptyAction} /> : null}
    </View>
  );
}

export function LoadingView({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.iris} size="large" />
      <Text variant="small" color={colors.textSecondary} style={styles.loadingLabel}>
        {label}
      </Text>
    </View>
  );
}

interface BadgeProps {
  label: string;
  tone?: 'iris' | 'mint' | 'apricot' | 'rose' | 'muted';
}

export function Badge({ label, tone = 'iris' }: BadgeProps) {
  const toneStyle = badgeTones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: toneStyle.bg }]}>
      <Text variant="caption" color={toneStyle.fg}>
        {label}
      </Text>
    </View>
  );
}

const badgeTones = {
  iris: { bg: colors.irisSoft, fg: colors.iris },
  mint: { bg: colors.mintSoft, fg: colors.mint },
  apricot: { bg: colors.apricotSoft, fg: colors.apricot },
  rose: { bg: colors.roseSoft, fg: colors.rose },
  muted: { bg: colors.surfaceMuted, fg: colors.textSecondary },
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenPadding: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 120,
  },
  button: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.soft,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    fontSize: 16,
    color: colors.text,
    fontFamily: 'Outfit_400Regular',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    gap: spacing.sm,
  },
  emptySubtitle: {
    textAlign: 'center',
    maxWidth: 280,
  },
  emptyAction: {
    marginTop: spacing.md,
    minWidth: 160,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingLabel: {
    marginTop: spacing.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
});
