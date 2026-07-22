import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, Card, Input, Screen, LoadingView, Badge } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { colors, spacing } from '@/src/lib/theme';
import { localDateStr } from '@/src/lib/dates';
import {
  createMission,
  fetchMissions,
  generateMissionSuggestions,
  updateMissionStatus,
  type SuggestedMission,
} from '@/src/api/missions';
import { fetchTransactions } from '@/src/api/transactions';
import { suggestMissions } from '@/src/lib/suggestMissions';
import { useAuthStore } from '@/src/store/authStore';
import { useCurrentWallet } from '@/src/hooks/useCurrentWallet';
import type { MissionStatus } from '@/src/api/types';

const STATUS_CYCLE: MissionStatus[] = ['active', 'kept', 'broken', 'dismissed'];

const STATUS_TONE: Record<MissionStatus, 'iris' | 'mint' | 'rose' | 'muted'> = {
  active: 'iris',
  kept: 'mint',
  broken: 'rose',
  dismissed: 'muted',
};

export default function MissionsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const { wallet } = useCurrentWallet();
  const [title, setTitle] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data: missions = [], isLoading } = useQuery({
    queryKey: ['missions', wallet?.id],
    queryFn: () => fetchMissions(wallet!.id),
    enabled: !!wallet?.id,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', wallet?.id],
    queryFn: () => fetchTransactions(wallet!.id),
    enabled: !!wallet?.id,
  });

  const normTitle = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const suggestMut = useMutation({
    mutationFn: async () => {
      let ideas: SuggestedMission[] = [];
      try {
        // Fresh, AI-written missions from this wallet's goals + spending, so
        // each tap is unique rather than the old fixed template.
        ideas = await generateMissionSuggestions(wallet!.id);
      } catch (err) {
        // A real failure (e.g. rate limit) surfaces its message; we still fall
        // back to the local starter ideas below so suggest always works.
        Alert.alert('Error', err instanceof Error ? err.message : 'Something went wrong.');
      }
      if (ideas.length === 0) ideas = suggestMissions(transactions);

      // First idea whose title isn't already one of the user's missions.
      const existing = new Set(missions.map((m) => normTitle(m.title)));
      const idea = ideas.find((i) => !existing.has(normTitle(i.title))) ?? ideas[0];
      if (!idea) return null;

      return createMission(wallet!.id, session!.user.id, idea);
    },
    onSuccess: (mission) => {
      if (!mission) {
        Alert.alert('Missions', 'Need a bit more spending history before I can suggest a mission.');
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['missions', wallet?.id] });
      Alert.alert('Mission added', mission.title);
    },
    onError: (err) => Alert.alert('Error', err instanceof Error ? err.message : 'Could not create'),
  });

  const createMut = useMutation({
    mutationFn: () => {
      const today = localDateStr();
      const end = new Date();
      end.setDate(end.getDate() + 7);
      return createMission(wallet!.id, session!.user.id, {
        title: title.trim(),
        start_date: today,
        end_date: localDateStr(end),
      });
    },
    onSuccess: () => {
      setTitle('');
      setShowCreate(false);
      void queryClient.invalidateQueries({ queryKey: ['missions', wallet?.id] });
    },
    onError: (err) => Alert.alert('Error', err instanceof Error ? err.message : 'Could not create'),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MissionStatus }) => updateMissionStatus(id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['missions', wallet?.id] }),
  });

  if (isLoading) return <LoadingView />;

  const active = missions.filter((m) => m.status === 'active');

  function cycleStatus(id: string, current: MissionStatus) {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
    statusMut.mutate({ id, status: next });
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </AnimatedPressable>
        <Text variant="h2">Missions</Text>
        <View style={styles.spacer} />
      </View>

      <Card style={styles.hero}>
        <Text variant="caption" color={colors.textSecondary}>
          Active missions
        </Text>
        <Text variant="h1">{active.length}</Text>
      </Card>

      <Button
        title="Suggest a mission"
        onPress={() => suggestMut.mutate()}
        loading={suggestMut.isPending}
        disabled={suggestMut.isPending}
        style={styles.suggestBtn}
      />

      <Button
        title="New mission"
        variant="secondary"
        onPress={() => setShowCreate(true)}
        style={styles.createBtn}
      />

      {showCreate ? (
        <Card style={styles.form}>
          <Input value={title} onChangeText={setTitle} placeholder="Mission title" />
          <Button title="Create" onPress={() => createMut.mutate()} loading={createMut.isPending} disabled={!title.trim()} />
        </Card>
      ) : null}

      {missions.length === 0 ? (
        <Text variant="body" color={colors.textSecondary} style={styles.empty}>
          No missions yet. Add a small commitment to track.
        </Text>
      ) : (
        missions.map((m) => (
          <Card key={m.id} style={styles.mission}>
            <View style={styles.missionHeader}>
              <Text variant="bodyMedium" style={{ flex: 1 }}>
                {m.title}
              </Text>
              <AnimatedPressable onPress={() => cycleStatus(m.id, m.status)}>
                <Badge label={m.status} tone={STATUS_TONE[m.status]} />
              </AnimatedPressable>
            </View>
            {m.description ? (
              <Text variant="caption" color={colors.textMuted}>
                {m.description}
              </Text>
            ) : null}
            <Text variant="caption" color={colors.textMuted}>
              {m.start_date} to {m.end_date}
            </Text>
          </Card>
        ))
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
    marginBottom: spacing.lg,
  },
  spacer: { width: 22 },
  hero: { gap: spacing.xs, marginBottom: spacing.lg },
  suggestBtn: { marginBottom: spacing.md },
  createBtn: { marginBottom: spacing.lg },
  form: { gap: spacing.md, marginBottom: spacing.lg },
  empty: { textAlign: 'center', marginTop: spacing.xl },
  mission: { marginBottom: spacing.sm, gap: spacing.xs },
  missionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
