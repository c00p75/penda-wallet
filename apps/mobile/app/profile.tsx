import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, Input, Screen, LoadingView, Card } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { colors, spacing } from '@/src/lib/theme';
import { fetchProfile, updateProfile } from '@/src/api/profile';
import { useAuthStore } from '@/src/store/authStore';

export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
  });

  const [displayName, setDisplayName] = useState('');
  const [editing, setEditing] = useState(false);

  const updateMutation = useMutation({
    mutationFn: () => updateProfile(userId!, { display_name: displayName.trim() || null }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
      setEditing(false);
      Alert.alert('Saved', 'Profile updated.');
    },
    onError: (err) => {
      Alert.alert('Error', err instanceof Error ? err.message : 'Update failed');
    },
  });

  if (isLoading || !profile) return <LoadingView label="Loading profile…" />;

  const startEdit = () => {
    setDisplayName(profile.display_name ?? '');
    setEditing(true);
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </AnimatedPressable>
        <Text variant="h2">Profile</Text>
        <View style={styles.spacer} />
      </View>

      <Card style={styles.card}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={32} color={colors.iris} />
        </View>
        {editing ? (
          <>
            <Text variant="label" color={colors.textSecondary}>
              Display name
            </Text>
            <Input value={displayName} onChangeText={setDisplayName} placeholder="Your name" />
            <View style={styles.editActions}>
              <Button
                title="Save"
                onPress={() => updateMutation.mutate()}
                loading={updateMutation.isPending}
                style={styles.editBtn}
              />
              <Button title="Cancel" variant="secondary" onPress={() => setEditing(false)} style={styles.editBtn} />
            </View>
          </>
        ) : (
          <>
            <Text variant="h2">{profile.display_name ?? 'No name set'}</Text>
            <Text variant="body" color={colors.textSecondary}>
              {session?.user.email}
            </Text>
            <AnimatedPressable onPress={startEdit} style={styles.editLink}>
              <Text variant="label" color={colors.iris}>
                Edit display name
              </Text>
            </AnimatedPressable>
          </>
        )}
      </Card>

      <Card style={styles.card}>
        <ProfileField label="Default currency" value={profile.default_currency} />
        <ProfileField label="AI personality" value={profile.ai_personality.replace(/_/g, ' ')} />
        <ProfileField label="Mode" value={profile.mode} />
        <ProfileField label="Notifications" value={profile.notification_opt_in ? 'On' : 'Off'} />
      </Card>
    </Screen>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text variant="caption" color={colors.textMuted}>
        {label}
      </Text>
      <Text variant="bodyMedium">{value}</Text>
    </View>
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
  card: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.irisSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  editLink: {
    marginTop: spacing.md,
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
    marginTop: spacing.sm,
  },
  editBtn: {
    flex: 1,
  },
  field: {
    width: '100%',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
