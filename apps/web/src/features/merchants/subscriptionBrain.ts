import type { Transaction } from '@/features/transactions/types'

export type MerchantSignalKind = 'price_change' | 'possible_sub' | 'quiet_sub'

export interface MerchantSignal {
  id: string
  kind: MerchantSignalKind
  merchant: string
  summary: string
  /** Latest amount seen. */
  amountMinor: number
  previousAmountMinor?: number
  lastSeen: string
  count: number
}

const SUB_HINT = /netflix|spotify|dstv|showmax|apple|google|amazon|prime|gym|insurance|subscription|debit order|auto.?pay/i

/**
 * Detect subscription-like merchants, price changes, and quiet (unused) subs.
 */
export function detectMerchantSignals(
  transactions: Transaction[],
  opts: { now?: Date; lookbackDays?: number } = {},
): MerchantSignal[] {
  const now = opts.now ?? new Date()
  const lookback = opts.lookbackDays ?? 120
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - lookback)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const byMerchant = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    if (tx.type !== 'expense' || !tx.merchant?.trim()) continue
    if (tx.transaction_date < cutoffStr) continue
    const key = normalizeMerchant(tx.merchant)
    const list = byMerchant.get(key) ?? []
    list.push(tx)
    byMerchant.set(key, list)
  }

  const signals: MerchantSignal[] = []

  for (const [merchant, list] of byMerchant) {
    list.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))
    const amounts = list.map((t) => t.converted_amount_minor ?? t.amount_minor)
    const last = list[list.length - 1]!
    const lastAmt = amounts[amounts.length - 1]!
    const count = list.length

    // Price change: last vs median of prior
    if (count >= 3) {
      const prior = amounts.slice(0, -1)
      const med = median(prior)
      if (med > 0 && Math.abs(lastAmt - med) / med >= 0.12) {
        const up = lastAmt > med
        signals.push({
          id: `price:${merchant}`,
          kind: 'price_change',
          merchant: last.merchant!,
          summary: up
            ? `${last.merchant} jumped vs your usual (~${pct(lastAmt, med)} higher).`
            : `${last.merchant} dropped vs your usual (~${pct(med, lastAmt)} lower).`,
          amountMinor: lastAmt,
          previousAmountMinor: med,
          lastSeen: last.transaction_date,
          count,
        })
      }
    }

    // Possible subscription: 2+ similar amounts ~monthly
    if (count >= 2) {
      const gaps = dayGaps(list.map((t) => t.transaction_date))
      const monthlyish = gaps.filter((g) => g >= 25 && g <= 40).length >= 1
      const similar = amounts.every((a) => Math.abs(a - lastAmt) / Math.max(lastAmt, 1) < 0.08)
      if ((monthlyish && similar) || SUB_HINT.test(merchant)) {
        const daysSince = daysBetween(last.transaction_date, now.toISOString().slice(0, 10))
        if (daysSince > 45 && (monthlyish || SUB_HINT.test(merchant))) {
          signals.push({
            id: `quiet:${merchant}`,
            kind: 'quiet_sub',
            merchant: last.merchant!,
            summary: `${last.merchant} looks like a sub you haven’t paid in ${daysSince} days — still need it?`,
            amountMinor: lastAmt,
            lastSeen: last.transaction_date,
            count,
          })
        } else if (monthlyish || SUB_HINT.test(merchant)) {
          signals.push({
            id: `sub:${merchant}`,
            kind: 'possible_sub',
            merchant: last.merchant!,
            summary: `${last.merchant} looks like a recurring charge (${count}× in ${lookback}d).`,
            amountMinor: lastAmt,
            lastSeen: last.transaction_date,
            count,
          })
        }
      }
    }
  }

  // Prefer quieter / price signals first; cap
  const rank = { quiet_sub: 0, price_change: 1, possible_sub: 2 }
  return signals
    .sort((a, b) => rank[a.kind] - rank[b.kind] || b.lastSeen.localeCompare(a.lastSeen))
    .slice(0, 8)
}

function normalizeMerchant(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2)
}

function dayGaps(dates: string[]): number[] {
  const gaps: number[] = []
  for (let i = 1; i < dates.length; i++) {
    gaps.push(daysBetween(dates[i - 1]!, dates[i]!))
  }
  return gaps
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`)) / 86_400_000)
}

function pct(a: number, b: number): string {
  return `${Math.round((Math.abs(a - b) / Math.max(b, 1)) * 100)}%`
}
