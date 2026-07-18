import { supabase } from '@/src/lib/supabase';
import { localDateStr } from '@/src/lib/dates';
import type { SplitWithMeta } from '@/src/api/types';

export async function fetchWalletSplits(walletId: string): Promise<SplitWithMeta[]> {
  const { data: splits, error } = await supabase
    .from('expense_splits')
    .select(
      `
      id,
      wallet_id,
      transaction_id,
      created_by,
      expense_split_shares (
        id,
        split_id,
        member_user_id,
        share_minor,
        settled
      ),
      transaction:transactions (
        id,
        amount_minor,
        merchant,
        transaction_date,
        created_by
      )
    `,
    )
    .eq('wallet_id', walletId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (splits ?? []).map((row) => {
    const tx = row.transaction as unknown as {
      id: string;
      amount_minor: number;
      merchant: string | null;
      transaction_date: string;
      created_by: string;
    } | null;
    return {
      id: row.id,
      wallet_id: row.wallet_id,
      transaction_id: row.transaction_id,
      created_by: row.created_by,
      payer_user_id: tx?.created_by ?? row.created_by,
      amount_minor: tx?.amount_minor ?? 0,
      merchant: tx?.merchant ?? null,
      transaction_date: tx?.transaction_date ?? '',
      shares: (row.expense_split_shares ?? []) as SplitWithMeta['shares'],
    };
  });
}

export async function markSharesSettled(shareIds: string[]): Promise<void> {
  if (shareIds.length === 0) return;
  const { error } = await supabase
    .from('expense_split_shares')
    .update({ settled: true })
    .in('id', shareIds);
  if (error) throw error;
}

export async function recordSettlementPayment(input: {
  walletId: string;
  userId: string;
  currency: string;
  amountMinor: number;
  fromUserId: string;
  toLabel: string;
  shareIds: string[];
}): Promise<void> {
  const { error } = await supabase.from('transactions').insert({
    wallet_id: input.walletId,
    created_by: input.userId,
    category_id: null,
    amount_minor: input.amountMinor,
    currency: input.currency,
    type: 'expense',
    merchant: `Settle up → ${input.toLabel}`,
    description: 'Split settlement',
    transaction_date: localDateStr(),
    source: 'manual',
    user_confirmed: true,
  });
  if (error) throw error;
  await markSharesSettled(input.shareIds);
}
