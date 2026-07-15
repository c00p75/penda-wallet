import type { Transaction } from '@/features/transactions/types'
import type { Category } from '@/features/categories/types'
import type { Budget } from '@/features/budgets/types'
import type { SavingsGoal } from '@/features/goals/types'
import type { Debt } from '@/features/debts/types'
import { fromMinorUnits } from '@/lib/money'

export interface ExportBundle {
  transactions: Transaction[]
  budgets: Budget[]
  goals: SavingsGoal[]
  debts: Debt[]
  categories: Category[]
}

/** Ownership is a trust play (Security & Data Control backlog): the full financial history, structured for re-import elsewhere. */
export function buildExportJSON(bundle: ExportBundle): string {
  const categoryName = (id: string | null) => bundle.categories.find((c) => c.id === id)?.name ?? null
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      transactions: bundle.transactions.map((tx) => ({
        date: tx.transaction_date,
        type: tx.type,
        amount: fromMinorUnits(tx.amount_minor),
        currency: tx.currency,
        category: categoryName(tx.category_id),
        merchant: tx.merchant,
        description: tx.description,
        source: tx.source,
      })),
      budgets: bundle.budgets.map((b) => ({
        category: categoryName(b.category_id),
        amount: fromMinorUnits(b.amount_minor),
        period: b.period,
        rollover: b.rollover,
      })),
      goals: bundle.goals.map((g) => ({
        name: g.name,
        target_amount: fromMinorUnits(g.target_amount_minor),
        current_amount: fromMinorUnits(g.current_amount_minor),
        target_date: g.target_date,
      })),
      debts: bundle.debts.map((d) => ({
        name: d.name,
        direction: d.direction,
        counterparty: d.counterparty,
        principal: fromMinorUnits(d.principal_minor),
        balance: fromMinorUnits(d.balance_minor),
        due_date: d.due_date,
      })),
    },
    null,
    2,
  )
}

function csvField(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

function toCSV(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n')
}

/** Transactions are the one entity type that reads naturally as a single flat table. */
export function buildTransactionsCSV(bundle: Pick<ExportBundle, 'transactions' | 'categories'>): string {
  const categoryName = (id: string | null) => bundle.categories.find((c) => c.id === id)?.name ?? ''
  const header = ['date', 'type', 'amount', 'currency', 'category', 'merchant', 'description', 'source']
  const rows = bundle.transactions.map((tx) => [
    tx.transaction_date,
    tx.type,
    fromMinorUnits(tx.amount_minor),
    tx.currency,
    categoryName(tx.category_id),
    tx.merchant ?? '',
    tx.description ?? '',
    tx.source,
  ])
  return toCSV([header, ...rows])
}
