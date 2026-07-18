import { formatMoney } from '@/lib/money'

export interface FamilyAllowance {
  id: string
  name: string
  current_amount_minor: number
  target_amount_minor: number
  assigned_member_id?: string | null
}

export interface FamilySettleBalance {
  name: string
  /** Positive = they owe the household / you; negative = you owe them. */
  netMinor: number
}

export interface FamilyCompanionTip {
  id: string
  text: string
  chatSeed: string
  href: '/family' | '/settle-up'
}

/**
 * Household-framed nudges for Family mode, allowance left, settle-up due.
 */
export function detectFamilyCompanionTips(opts: {
  mode: string
  currency: string
  allowances: FamilyAllowance[]
  settleBalances?: FamilySettleBalance[]
  enabled?: boolean
}): FamilyCompanionTip[] {
  if (opts.enabled === false) return []
  if (opts.mode !== 'family') return []

  const tips: FamilyCompanionTip[] = []

  for (const a of opts.allowances) {
    if (a.target_amount_minor <= 0) continue
    const remaining = a.target_amount_minor - a.current_amount_minor
    const pct = a.current_amount_minor / a.target_amount_minor
    if (remaining > 0 && pct >= 0.85) {
      tips.push({
        id: `family-allowance-low:${a.id}`,
        text: `${a.name} has ${formatMoney(remaining, opts.currency)} left this period.`,
        chatSeed: `Help me plan the remaining ${a.name}.`,
        href: '/family',
      })
    }
  }

  const due = (opts.settleBalances ?? []).filter((b) => Math.abs(b.netMinor) >= 5000)
  const top = due.sort((a, b) => Math.abs(b.netMinor) - Math.abs(a.netMinor))[0]
  if (top) {
    const amt = formatMoney(Math.abs(top.netMinor), opts.currency)
    tips.push({
      id: `family-settle:${top.name}`,
      text:
        top.netMinor > 0
          ? `${top.name} owes ${amt}, want a settle-up nudge?`
          : `You owe ${top.name} ${amt}, ready to settle up?`,
      chatSeed: `Help me settle up with ${top.name}.`,
      href: '/settle-up',
    })
  }

  return tips.slice(0, 3)
}
