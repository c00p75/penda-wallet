import { Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { findTransferSibling, isDebtPaymentCategory } from '@penda/money-core';
import { deleteTransaction } from '@/src/api/transactions';
import { deleteDebtPayment, fetchPaymentByTransactionId } from '@/src/api/debts';
import { formatMoney } from '@/src/lib/money';
import type { Account } from '@/src/api/accounts';
import type { Transaction } from '@/src/api/types';

function pocketLabel(accounts: Account[], accountId: string | null): string | null {
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return null;
  return account.icon ? `${account.icon} ${account.name}` : account.name;
}

/**
 * Shared delete-confirmation flow: gate every delete behind an Alert, and
 * when the transaction is one leg of a transfer or posted a debt payment,
 * offer to reverse that side too so the money isn't left stranded.
 */
export function useDeleteTransactionFlow(walletId: string | undefined) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions', walletId] });
      void queryClient.invalidateQueries({ queryKey: ['budgetProgress', walletId] });
    },
    onError: (err) => {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not delete transaction');
    },
  });

  const reverseMutation = useMutation({
    mutationFn: (paymentId: string) => deleteDebtPayment(paymentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['debts', walletId] });
      void queryClient.invalidateQueries({ queryKey: ['transactions', walletId] });
      void queryClient.invalidateQueries({ queryKey: ['budgetProgress', walletId] });
    },
    onError: (err) => {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not reverse the payment');
    },
  });

  async function confirmDelete(tx: Transaction, transactions: Transaction[], accounts: Account[]) {
    const label = tx.merchant || tx.description || 'this transaction';

    const sibling = tx.type === 'transfer' ? findTransferSibling(transactions, tx) : null;
    if (sibling) {
      const otherLabel = pocketLabel(accounts, sibling.account_id) ?? 'the other pocket';
      Alert.alert(
        'Delete transfer entry?',
        `This is one side of a transfer with ${otherLabel}. Delete just this entry, or both sides to fully return the money?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Just this one', onPress: () => deleteMutation.mutate(tx.id) },
          {
            text: 'Delete both',
            style: 'destructive',
            onPress: () => {
              deleteMutation.mutate(tx.id);
              deleteMutation.mutate(sibling.id);
            },
          },
        ],
      );
      return;
    }

    if (isDebtPaymentCategory(tx.category?.name)) {
      const payment = await fetchPaymentByTransactionId(tx.id).catch(() => null);
      if (payment) {
        const debtName = payment.debt?.name ?? 'this debt';
        Alert.alert(
          'Delete payment?',
          `This was a payment on "${debtName}". Reverse it too, so the balance goes back up by ${formatMoney(payment.amount_minor, tx.currency)}?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Keep debt paid', onPress: () => deleteMutation.mutate(tx.id) },
            {
              text: 'Reverse & delete',
              style: 'destructive',
              onPress: () => {
                deleteMutation.mutate(tx.id);
                reverseMutation.mutate(payment.id);
              },
            },
          ],
        );
        return;
      }
    }

    Alert.alert('Delete transaction?', `Remove ${label}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(tx.id) },
    ]);
  }

  return { confirmDelete, isPending: deleteMutation.isPending || reverseMutation.isPending };
}
