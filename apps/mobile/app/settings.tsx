import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, Screen, LoadingView } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { colors, radius, spacing } from '@/src/lib/theme';
import { supabase } from '@/src/lib/supabase';
import { fetchWallets } from '@/src/api/wallets';
import { useAuthStore } from '@/src/store/authStore';
import { useWalletStore } from '@/src/store/walletStore';
import { useLockStore } from '@/src/store/lockStore';
import { useSmsStore } from '@/src/store/smsStore';

const MORE_LINKS = [
  { href: '/cashflow', label: 'Cashflow', icon: 'trending-up-outline' as const },
  { href: '/journal', label: 'Journal', icon: 'book-outline' as const },
  { href: '/simulator', label: 'Simulator', icon: 'flask-outline' as const },
  { href: '/business', label: 'Business', icon: 'briefcase-outline' as const },
  { href: '/family', label: 'Family', icon: 'people-outline' as const },
  { href: '/challenges', label: 'Challenges', icon: 'trophy-outline' as const },
  { href: '/missions', label: 'Missions', icon: 'flag-outline' as const },
  { href: '/settle-up', label: 'Settle up', icon: 'swap-horizontal-outline' as const },
  { href: '/activity', label: 'Activity log', icon: 'list-outline' as const },
  { href: '/ai-actions', label: 'AI actions', icon: 'sparkles-outline' as const },
];

export default function SettingsScreen() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const activeWalletId = useWalletStore((s) => s.activeWalletId);
  const setActiveWalletId = useWalletStore((s) => s.setActiveWalletId);
  const lockEnabled = useLockStore((s) => s.enabled);
  const disableLock = useLockStore((s) => s.disable);
  const smsEnabled = useSmsStore((s) => s.enabled);
  const setSmsEnabled = useSmsStore((s) => s.setEnabled);

  const { data: wallets = [], isLoading } = useQuery({
    queryKey: ['wallets', session?.user.id],
    queryFn: () => fetchWallets(session!.user.id),
    enabled: !!session?.user.id,
  });

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          setActiveWalletId(null);
          router.replace('/login');
        },
      },
    ]);
  }

  if (isLoading) return <LoadingView />;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </AnimatedPressable>
        <Text variant="h2">Settings</Text>
        <View style={styles.spacer} />
      </View>

      <Text variant="label" color={colors.textMuted} style={styles.sectionLabel}>
        Active wallet
      </Text>
      {wallets.map((w) => (
        <Pressable
          key={w.id}
          onPress={() => setActiveWalletId(w.id)}
          style={[styles.walletRow, w.id === activeWalletId && styles.walletRowActive]}
        >
          <View>
            <Text variant="bodyMedium">{w.name}</Text>
            <Text variant="caption" color={colors.textMuted}>
              {w.base_currency}
            </Text>
          </View>
          {w.id === activeWalletId ? (
            <Ionicons name="checkmark-circle" size={22} color={colors.iris} />
          ) : null}
        </Pressable>
      ))}

      <Text variant="label" color={colors.textMuted} style={styles.sectionLabel}>
        Account
      </Text>
      <AnimatedPressable onPress={() => router.push('/profile')} style={styles.linkRow}>
        <Ionicons name="person-outline" size={20} color={colors.text} />
        <Text variant="bodyMedium">Profile</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={styles.chevron} />
      </AnimatedPressable>
      <AnimatedPressable onPress={() => router.push('/notifications')} style={styles.linkRow}>
        <Ionicons name="notifications-outline" size={20} color={colors.text} />
        <Text variant="bodyMedium">Notifications</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={styles.chevron} />
      </AnimatedPressable>

      <Text variant="label" color={colors.textMuted} style={styles.sectionLabel}>
        Security
      </Text>
      <View style={styles.linkRow}>
        <Ionicons name="lock-closed-outline" size={20} color={colors.text} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyMedium">App lock</Text>
          <Text variant="caption" color={colors.textMuted}>
            {lockEnabled ? 'Balances hidden until unlocked' : 'Off'}
          </Text>
        </View>
        <Switch
          value={lockEnabled}
          onValueChange={(on) => {
            if (on) router.push('/lock-setup');
            else {
              Alert.alert('Turn off lock?', 'Balances will always be visible.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Turn off', style: 'destructive', onPress: () => disableLock() },
              ]);
            }
          }}
          trackColor={{ true: colors.irisSoft, false: colors.surfaceMuted }}
          thumbColor={lockEnabled ? colors.iris : colors.textMuted}
        />
      </View>

      {Platform.OS === 'android' ? (
        <View style={styles.linkRow}>
          <Ionicons name="phone-portrait-outline" size={20} color={colors.text} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium">SMS auto-log</Text>
            <Text variant="caption" color={colors.textMuted}>
              Log MoMo SMS automatically
            </Text>
          </View>
          <Switch
            value={smsEnabled}
            onValueChange={setSmsEnabled}
            trackColor={{ true: colors.irisSoft, false: colors.surfaceMuted }}
            thumbColor={smsEnabled ? colors.iris : colors.textMuted}
          />
        </View>
      ) : null}

      <Text variant="label" color={colors.textMuted} style={styles.sectionLabel}>
        More
      </Text>
      {MORE_LINKS.map((link) => (
        <AnimatedPressable key={link.href} onPress={() => router.push(link.href as never)} style={styles.linkRow}>
          <Ionicons name={link.icon} size={20} color={colors.text} />
          <Text variant="bodyMedium">{link.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={styles.chevron} />
        </AnimatedPressable>
      ))}

      <View style={styles.note}>
        <Text variant="caption" color={colors.textMuted}>
          Theme follows your device light/dark setting. Iris & apricot brand colors are applied throughout Penda.
        </Text>
      </View>

      <Button title="Sign out" variant="danger" onPress={() => void handleSignOut()} style={styles.signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  spacer: {
    width: 22,
  },
  sectionLabel: {
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  walletRowActive: {
    borderColor: colors.iris,
    backgroundColor: colors.irisSoft,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
  },
  chevron: {
    marginLeft: 'auto',
  },
  note: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
  },
  signOut: {
    marginTop: spacing.xl,
  },
});
