import type { Transaction } from '@/features/transactions/types'
import { localDateStr, localMonthPrefix } from '@/lib/dates'

export interface SuggestedMission {
  title: string
  description: string
  start_date: string
  end_date: string
}

/**
 * Offline fallback for "Suggest a mission": deterministic client-side ideas
 * from recent spending (e.g. no-spend days in the top category), used only
 * when the AI generate-mission-suggestions edge function is unavailable or
 * has no data to work with. The primary path is now AI-generated missions.
 */
export function suggestMissions(transactions: Transaction[], now: Date = new Date()): SuggestedMission[] {
  const monthPrefix = localMonthPrefix(now)
  const monthExpenses = transactions.filter(
    (tx) => tx.type === 'expense' && tx.transaction_date.startsWith(monthPrefix),
  )

  const byCategory = new Map<string, { name: string; amount: number }>()
  for (const tx of monthExpenses) {
    const name = tx.category?.name ?? 'uncategorized spending'
    const key = tx.category_id ?? name
    const existing = byCategory.get(key)
    byCategory.set(key, { name, amount: (existing?.amount ?? 0) + tx.amount_minor })
  }

  const top = Array.from(byCategory.values()).sort((a, b) => b.amount - a.amount)[0]
  const start = localDateStr(now)
  const end5 = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4))
  const end7 = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6))

  const suggestions: SuggestedMission[] = []

  if (top) {
    suggestions.push({
      title: `5 no-spend days, ${top.name}`,
      description: `Skip ${top.name} for five days. You’ve already spent on it this month, a short pause resets the habit.`,
      start_date: start,
      end_date: end5,
    })
  }

  suggestions.push({
    title: 'Cash-only weekend',
    description: 'No card or MoMo impulse buys from Friday evening through Sunday, cash only for fun money.',
    start_date: start,
    end_date: end7,
  })

  suggestions.push({
    title: 'Cook at home this week',
    description: 'Seven days without takeout or restaurant meals. Pack lunch if you can.',
    start_date: start,
    end_date: end7,
  })

  return suggestions
}
