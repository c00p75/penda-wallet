import type { Transaction } from '@/src/api/types';
import { localMonthEnd, localMonthStart } from '@/src/lib/dates';

export function txEffectiveAmount(tx: Transaction): number {
  return tx.converted_amount_minor ?? tx.amount_minor;
}

export function computeMonthlyBalance(transactions: Transaction[]): number {
  const start = localMonthStart();
  const end = localMonthEnd();
  return transactions
    .filter((tx) => tx.transaction_date >= start && tx.transaction_date <= end)
    .reduce((sum, tx) => {
      const amount = txEffectiveAmount(tx);
      if (tx.type === 'income') return sum + amount;
      if (tx.type === 'expense') return sum - amount;
      return sum;
    }, 0);
}

export function computeMonthlyTotals(transactions: Transaction[]): {
  incomeMinor: number;
  expenseMinor: number;
} {
  const start = localMonthStart();
  const end = localMonthEnd();
  let incomeMinor = 0;
  let expenseMinor = 0;

  for (const tx of transactions) {
    if (tx.transaction_date < start || tx.transaction_date > end) continue;
    const amount = txEffectiveAmount(tx);
    if (tx.type === 'income') incomeMinor += amount;
    else if (tx.type === 'expense') expenseMinor += amount;
  }

  return { incomeMinor, expenseMinor };
}

export function categoryBreakdown(transactions: Transaction[]): Map<string, number> {
  const start = localMonthStart();
  const end = localMonthEnd();
  const map = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    if (tx.transaction_date < start || tx.transaction_date > end) continue;
    const name = tx.category?.name ?? 'Uncategorized';
    map.set(name, (map.get(name) ?? 0) + txEffectiveAmount(tx));
  }

  return map;
}
