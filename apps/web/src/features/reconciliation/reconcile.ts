import type { BalanceReconciliation } from './types'

/**
 * Whether the reconciliation prompt should show today, once at most per
 * day, so it's a light daily touch rather than a nag. `latest` is the most
 * recent reconciliation on record (or null if never done).
 */
export function shouldPromptReconciliation(latest: BalanceReconciliation | null, now: Date = new Date()): boolean {
  if (!latest) return true
  const lastDate = latest.created_at.slice(0, 10)
  const today = now.toISOString().slice(0, 10)
  return lastDate < today
}
