import type { InsightTone } from '@/components/AiInsight'
import type { Transaction } from '@/features/transactions/types'
import { formatMoney } from '@/lib/money'
import type { CoachingInsight } from './detectCoachingInsights'

/** Word-bounded so merchants like "Coffee" do not match the "fee" substring. */
const FEE_PATTERN = /\b(fees?|charges?|transfer fees?|service fees?)\b/i

/** Small P2P-style amounts (under ~K20) that repeat to the same merchant. */
const SMALL_P2P_MAX_MINOR = 2000
const SMALL_P2P_MIN_COUNT = 3

export interface GhostLeakContext {
  transactions: Transaction[]
  currency: string
  now?: Date
}

/**
 * Spot compounding "ghost" leaks. SMS/transfer fees and tiny repeated P2P
 * sends that add up without feeling like real spending.
 */
export function detectGhostLeaks(ctx: GhostLeakContext): CoachingInsight[] {
  const now = ctx.now ?? new Date()
  const cutoff = new Date(now)
  cutoff.setUTCDate(cutoff.getUTCDate() - 30)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const recent = ctx.transactions.filter(
    (tx) => tx.type === 'expense' && tx.transaction_date >= cutoffStr,
  )

  const insights: CoachingInsight[] = []

  const feeTx = recent.filter((tx) => {
    const hay = `${tx.merchant ?? ''} ${tx.description ?? ''}`
    return FEE_PATTERN.test(hay)
  })
  if (feeTx.length >= 2) {
    const total = feeTx.reduce((sum, tx) => sum + (tx.converted_amount_minor ?? tx.amount_minor), 0)
    insights.push({
      id: 'ghost:fees',
      kind: 'observability',
      tone: 'warm' as InsightTone,
      amountMinor: total,
      text: `I spotted ${feeTx.length} fee-like charges totaling ${formatMoney(total, ctx.currency)} in the last 30 days, quiet leaks that add up.`,
    })
  }

  const byMerchant = new Map<string, Transaction[]>()
  for (const tx of recent) {
    if (tx.amount_minor > SMALL_P2P_MAX_MINOR) continue
    const key = (tx.merchant ?? tx.description ?? '').trim().toLowerCase()
    if (!key) continue
    const list = byMerchant.get(key) ?? []
    list.push(tx)
    byMerchant.set(key, list)
  }

  let best: { merchant: string; count: number; total: number } | null = null
  for (const [merchant, list] of byMerchant) {
    if (list.length < SMALL_P2P_MIN_COUNT) continue
    const total = list.reduce((sum, tx) => sum + (tx.converted_amount_minor ?? tx.amount_minor), 0)
    if (!best || list.length > best.count || (list.length === best.count && total > best.total)) {
      best = { merchant, count: list.length, total }
    }
  }

  if (best) {
    insights.push({
      id: `ghost:p2p:${best.merchant}`,
      kind: 'observability',
      tone: 'default',
      amountMinor: best.total,
      text: `${best.count} small sends to “${best.merchant}” added up to ${formatMoney(best.total, ctx.currency)} this month, a phantom leak worth watching.`,
    })
  }

  return insights
}
