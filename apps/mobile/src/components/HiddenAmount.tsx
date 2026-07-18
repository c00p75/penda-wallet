import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/src/components/ui';
import { colors } from '@/src/lib/theme';
import { useLockStore } from '@/src/store/lockStore';

interface HiddenAmountProps {
  children: ReactNode;
}

export function HiddenAmount({ children }: HiddenAmountProps) {
  const enabled = useLockStore((s) => s.enabled);
  const unlocked = useLockStore((s) => s.unlocked);
  const promptUnlock = useLockStore((s) => s.promptUnlock);

  if (!enabled || unlocked) return <>{children}</>;

  return (
    <Pressable onPress={promptUnlock} style={styles.hidden} accessibilityLabel="Balance hidden, tap to reveal">
      <Text variant="bodyMedium" color={colors.textMuted} style={styles.dots}>
        ••••
      </Text>
      <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hidden: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dots: {
    letterSpacing: 2,
  },
});
