import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, Card, Input, Screen, LoadingView, Badge } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { colors, radius, spacing } from '@/src/lib/theme';
import { formatMoney } from '@/src/lib/money';
import { localDateStr } from '@/src/lib/dates';
import {
  archiveChallenge,
  createChallenge,
  fetchArchivedChallenges,
  fetchChallenges,
  fetchLeaderboard,
  joinChallenge,
  leaveChallenge,
  unarchiveChallenge,
} from '@/src/api/challenges';
import { useAuthStore } from '@/src/store/authStore';
import { useCurrentWallet } from '@/src/hooks/useCurrentWallet';
import type { Challenge, ChallengeType } from '@/src/api/types';

function hasEnded(c: Challenge): boolean {
  return c.end_date < localDateStr();
}

function ChallengeLeaderboard({ challengeId }: { challengeId: string }) {
  const { data: entries = [] } = useQuery({
    queryKey: ['leaderboard', challengeId],
    queryFn: () => fetchLeaderboard(challengeId),
  });

  if (entries.length === 0) {
    return (
      <Text variant="caption" color={colors.textMuted}>
        No scores yet.
      </Text>
    );
  }

  return (
    <>
      {entries.map((e, i) => (
        <View key={e.user_id} style={styles.leaderRow}>
          <Text variant="bodyMedium">
            {i + 1}. {e.display_name || 'Member'}
          </Text>
          <Text variant="label">{e.value}</Text>
        </View>
      ))}
    </>
  );
}

export default function ChallengesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const { wallet } = useCurrentWallet();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<ChallengeType>('savings_target');
  const [targetAmount, setTargetAmount] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const { data: challenges = [], isLoading } = useQuery({
    queryKey: ['challenges'],
    queryFn: fetchChallenges,
  });

  const { data: archivedChallenges = [] } = useQuery({
    queryKey: ['challenges-archived'],
    queryFn: fetchArchivedChallenges,
  });

  const createMut = useMutation({
    mutationFn: () => {
      const today = localDateStr();
      const end = new Date();
      end.setDate(end.getDate() + 30);
      return createChallenge({
        name: name.trim(),
        type,
        target_metric: { amount_minor: Math.round(Number(targetAmount) * 100) || 0, currency: wallet!.base_currency },
        start_date: today,
        end_date: localDateStr(end),
        wallet_id: wallet!.id,
      });
    },
    onSuccess: () => {
      setShowCreate(false);
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
      Alert.alert('Created', 'Share the invite code to add friends.');
    },
    onError: (err) => Alert.alert('Error', err instanceof Error ? err.message : 'Could not create'),
  });

  const joinMut = useMutation({
    mutationFn: () => joinChallenge(joinCode.trim()),
    onSuccess: () => {
      setShowJoin(false);
      setJoinCode('');
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
      Alert.alert('Joined', 'You are in the challenge.');
    },
    onError: (err) => Alert.alert('Error', err instanceof Error ? err.message : 'Could not join'),
  });

  const leaveMut = useMutation({
    mutationFn: (id: string) => leaveChallenge(id, session!.user.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['challenges'] }),
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) => archiveChallenge(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
      void queryClient.invalidateQueries({ queryKey: ['challenges-archived'] });
    },
  });

  const unarchiveMut = useMutation({
    mutationFn: (id: string) => unarchiveChallenge(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
      void queryClient.invalidateQueries({ queryKey: ['challenges-archived'] });
    },
  });

  function confirmArchive(id: string, name: string) {
    Alert.alert(`Archive "${name}"?`, 'This hides it from the challenge list. The leaderboard and history are kept, and you can restore it later.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', onPress: () => archiveMut.mutate(id) },
    ]);
  }

  if (isLoading) return <LoadingView />;

  const active = challenges.filter((c) => !hasEnded(c));
  const myArchivedChallenges = archivedChallenges.filter((c) => c.creator_id === session?.user.id);

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </AnimatedPressable>
        <Text variant="h2">Challenges</Text>
        <View style={styles.spacer} />
      </View>

      <Text variant="body" color={colors.textSecondary} style={styles.subtitle}>
        Compete with friends on savings goals
      </Text>

      <View style={styles.actions}>
        <Button title="Create" onPress={() => setShowCreate(true)} style={styles.actionBtn} />
        <Button title="Join code" variant="secondary" onPress={() => setShowJoin(true)} style={styles.actionBtn} />
      </View>

      {showCreate ? (
        <Card style={styles.form}>
          <Input value={name} onChangeText={setName} placeholder="Challenge name" />
          <View style={styles.typeRow}>
            {(['savings_target', 'spending_limit', 'no_spend_streak'] as const).map((t) => (
              <Pressable key={t} onPress={() => setType(t)} style={[styles.typeChip, type === t && styles.typeChipActive]}>
                <Text variant="caption" color={type === t ? '#FFF' : colors.text}>
                  {t.replace(/_/g, ' ')}
                </Text>
              </Pressable>
            ))}
          </View>
          {type !== 'no_spend_streak' ? (
            <Input value={targetAmount} onChangeText={setTargetAmount} keyboardType="decimal-pad" placeholder="Target amount" />
          ) : null}
          <Button title="Create challenge" onPress={() => createMut.mutate()} loading={createMut.isPending} disabled={!name.trim()} />
        </Card>
      ) : null}

      {showJoin ? (
        <Card style={styles.form}>
          <Input value={joinCode} onChangeText={setJoinCode} placeholder="Invite code" autoCapitalize="characters" />
          <Button title="Join" onPress={() => joinMut.mutate()} loading={joinMut.isPending} disabled={!joinCode.trim()} />
        </Card>
      ) : null}

      {active.length === 0 ? (
        <Text variant="body" color={colors.textSecondary} style={styles.empty}>
          No active challenges. Create one or join with a code.
        </Text>
      ) : (
        active.map((c) => (
          <Card key={c.id} style={styles.challenge}>
            <Pressable onPress={() => setExpandedId(expandedId === c.id ? null : c.id)}>
              <View style={styles.challengeHeader}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">{c.name}</Text>
                  <Text variant="caption" color={colors.textMuted}>
                    Code: {c.invite_code}
                  </Text>
                </View>
                <Badge label={c.type.replace(/_/g, ' ')} tone="iris" />
              </View>
            </Pressable>
            {expandedId === c.id ? (
              <View style={styles.expanded}>
                <ChallengeLeaderboard challengeId={c.id} />
                <View style={styles.challengeActions}>
                  <Button title="Leave" variant="secondary" onPress={() => leaveMut.mutate(c.id)} />
                  {c.creator_id === session?.user.id ? (
                    <Button title="Archive" variant="danger" onPress={() => confirmArchive(c.id, c.name)} />
                  ) : null}
                </View>
              </View>
            ) : null}
          </Card>
        ))
      )}

      {myArchivedChallenges.length > 0 && (
        <>
          <Text variant="label" color={colors.textMuted} style={styles.archivedHeader}>
            Archived
          </Text>
          {myArchivedChallenges.map((c) => (
            <Card key={c.id} style={styles.challenge}>
              <View style={styles.challengeHeader}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">{c.name}</Text>
                  <Text variant="caption" color={colors.textMuted}>
                    Code: {c.invite_code}
                  </Text>
                </View>
                <Badge label={c.type.replace(/_/g, ' ')} tone="muted" />
              </View>
              <Button
                title="Restore"
                variant="secondary"
                onPress={() => unarchiveMut.mutate(c.id)}
                loading={unarchiveMut.isPending}
                style={{ marginTop: spacing.sm }}
              />
            </Card>
          ))}
        </>
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
  archivedHeader: { marginTop: spacing.md, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  actionBtn: { flex: 1 },
  form: { gap: spacing.md, marginBottom: spacing.lg },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMuted,
  },
  typeChipActive: { backgroundColor: colors.iris },
  empty: { textAlign: 'center', marginTop: spacing.xl },
  challenge: { marginBottom: spacing.sm },
  challengeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  expanded: { marginTop: spacing.md, gap: spacing.sm },
  leaderRow: { flexDirection: 'row', justifyContent: 'space-between' },
  challengeActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
