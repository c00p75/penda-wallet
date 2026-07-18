export interface SplitShareRow {
  id: string;
  split_id: string;
  member_user_id: string;
  share_minor: number;
  settled: boolean;
}

export interface SplitWithMeta {
  id: string;
  wallet_id: string;
  transaction_id: string;
  created_by: string;
  payer_user_id: string;
  amount_minor: number;
  merchant: string | null;
  transaction_date: string;
  shares: SplitShareRow[];
}

export interface NetBalance {
  userId: string;
  /** Positive = others owe them; negative = they owe others. */
  netMinor: number;
}

export interface PairOwed {
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
  shareIds: string[];
}

export function netBalances(splits: SplitWithMeta[]): NetBalance[] {
  const map = new Map<string, number>();

  for (const split of splits) {
    for (const share of split.shares) {
      if (share.settled) continue;
      if (share.member_user_id === split.payer_user_id) continue;
      map.set(split.payer_user_id, (map.get(split.payer_user_id) ?? 0) + share.share_minor);
      map.set(share.member_user_id, (map.get(share.member_user_id) ?? 0) - share.share_minor);
    }
  }

  return [...map.entries()]
    .map(([userId, netMinor]) => ({ userId, netMinor }))
    .filter((b) => b.netMinor !== 0)
    .sort((a, b) => b.netMinor - a.netMinor);
}

export function openPairDebts(splits: SplitWithMeta[]): PairOwed[] {
  const pairs = new Map<string, PairOwed>();

  for (const split of splits) {
    for (const share of split.shares) {
      if (share.settled) continue;
      if (share.member_user_id === split.payer_user_id) continue;
      const key = `${share.member_user_id}->${split.payer_user_id}`;
      const existing = pairs.get(key);
      if (existing) {
        existing.amountMinor += share.share_minor;
        existing.shareIds.push(share.id);
      } else {
        pairs.set(key, {
          fromUserId: share.member_user_id,
          toUserId: split.payer_user_id,
          amountMinor: share.share_minor,
          shareIds: [share.id],
        });
      }
    }
  }

  return [...pairs.values()].sort((a, b) => b.amountMinor - a.amountMinor);
}
