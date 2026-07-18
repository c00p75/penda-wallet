import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/lib/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text variant="h2">This screen doesn&apos;t exist.</Text>
        <Link href="/" style={styles.link}>
          <Text variant="label" color={colors.iris}>
            Go home
          </Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  link: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
  },
});
