import { fetchTransactions } from '@/features/transactions/api'
import { fetchBudgets } from '@/features/budgets/api'
import { fetchSavingsGoals } from '@/features/goals/api'
import { fetchDebts } from '@/features/debts/api'
import { fetchCategories } from '@/features/categories/api'
import type { ExportBundle } from './exportData'

export async function fetchExportBundle(walletId: string): Promise<ExportBundle> {
  const [transactions, budgets, goals, debts, categories] = await Promise.all([
    fetchTransactions(walletId),
    fetchBudgets(walletId),
    fetchSavingsGoals(walletId),
    fetchDebts(walletId),
    fetchCategories(walletId),
  ])
  return { transactions, budgets, goals, debts, categories }
}
