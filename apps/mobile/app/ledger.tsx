import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Text, LoadingView } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { TransactionRow } from '@/src/components/TransactionRow';
import { colors, spacing } from '@/src/lib/theme';
import { deleteTransaction, fetchTransactions } from '@/src/api/transactions';
import { uploadReceipt } from '@/src/api/receipts';
import { useCurrentWallet } from '@/src/hooks/useCurrentWallet';
import { useAuthStore } from '@/src/store/authStore';
import { parseMoMoText } from '@/src/lib/momoParser';
import type { Transaction } from '@/src/api/types';

export default function LedgerScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const { wallet, isLoading: walletLoading } = useCurrentWallet();
  const [scanning, setScanning] = useState(false);

  const { data: transactions = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['transactions', wallet?.id],
    queryFn: () => fetchTransactions(wallet!.id),
    enabled: !!wallet?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions', wallet?.id] });
    },
    onError: (err) => {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not delete transaction');
    },
  });

  function confirmDelete(tx: Transaction) {
    const title = tx.merchant || tx.description || 'this transaction';
    Alert.alert('Delete transaction?', `Remove ${title}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(tx.id),
      },
    ]);
  }

  async function handlePasteMoMo() {
    const text = await Clipboard.getStringAsync();
    if (!text.trim()) {
      Alert.alert('Clipboard empty', 'Copy a MoMo SMS first.');
      return;
    }
    const parsed = parseMoMoText(text);
    if (parsed) {
      router.push({
        pathname: '/add-transaction',
        params: {
          type: parsed.type,
          amount: String(parsed.amountMinor / 100),
          merchant: parsed.merchant ?? '',
          date: parsed.transactionDate,
          source: 'sms',
        },
      });
    } else {
      Alert.alert('Could not parse', 'Paste a MoMo or bank SMS with a clear amount and direction.');
    }
  }

  async function handleScanReceipt() {
    if (!wallet?.id || !session?.user.id) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera needed', 'Allow camera access to scan receipts.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
    });
    if (result.canceled || !result.assets[0]) return;

    setScanning(true);
    try {
      const asset = result.assets[0];
      await uploadReceipt(
        wallet.id,
        session.user.id,
        asset.uri,
        asset.mimeType ?? 'image/jpeg',
      );
      void queryClient.invalidateQueries({ queryKey: ['transactions', wallet.id] });
      Alert.alert('Receipt scanned', 'A draft transaction was created from your receipt.');
    } catch (err) {
      Alert.alert('Scan failed', err instanceof Error ? err.message : 'Could not read receipt');
    } finally {
      setScanning(false);
    }
  }

  if (walletLoading || isLoading) return <LoadingView label="Loading transactions…" />;

  const currency = wallet?.base_currency ?? 'USD';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </AnimatedPressable>
        <Text variant="h2">Ledger</Text>
        <View style={styles.headerActions}>
          <AnimatedPressable onPress={() => void handleScanReceipt()} style={styles.momoBtn} disabled={scanning}>
            {scanning ? (
              <ActivityIndicator size="small" color={colors.iris} />
            ) : (
              <Ionicons name="camera-outline" size={20} color={colors.iris} />
            )}
          </AnimatedPressable>
          <AnimatedPressable onPress={() => void handlePasteMoMo()} style={styles.momoBtn}>
            <Ionicons name="clipboard-outline" size={20} color={colors.iris} />
          </AnimatedPressable>
        </View>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <TransactionRow
            transaction={item}
            currency={currency}
            index={index}
            onLongPress={() => confirmDelete(item)}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.iris} />
        }
        ListEmptyComponent={
          <Text variant="body" color={colors.textSecondary} style={styles.empty}>
            No transactions yet.
          </Text>
        }
      />

      <AnimatedPressable
        onPress={() => router.push('/add-transaction')}
        style={styles.fab}
        scaleTo={0.92}
      >
        <Ionicons name="add" size={28} color="#FFF" />
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  momoBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.irisSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 100,
  },
  empty: {
    textAlign: 'center',
    marginTop: spacing.xxxl,
  },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xxxl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.iris,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
