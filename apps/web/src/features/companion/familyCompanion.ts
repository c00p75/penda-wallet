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
 * Household / couple-framed nudges — allowances left, settle-up due.
 */
export function detectFamilyCompanionTips(opts: {
  mode: string
  currency: string
  allowances: FamilyAllowance[]
  settleBalances?: FamilySettleBalance[]
  enabled?: boolean
}): FamilyCompanionTip[] {
  if (opts.enabled === false) return []
  if (opts.mode !== 'family' && opts.mode !== 'couple') return []

  const tips: FamilyCompanionTip[] = []
  const couple = opts.mode === 'couple'

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
          ? couple
            ? `${top.name} owes you ${amt} on the shared ledger — settle up?`
            : `${top.name} owes ${amt}, want a settle-up nudge?`
          : couple
            ? `You owe ${top.name} ${amt} — fair-share settle?`
            : `You owe ${top.name} ${amt}, ready to settle up?`,
      chatSeed: couple
        ? `Help us settle fairly with ${top.name}.`
        : `Help me settle up with ${top.name}.`,
      href: '/settle-up',
    })
  } else if (couple) {
    tips.push({
      id: 'family-couple-os',
      text: 'Couple mode: joint plan + private envelopes. Want a fair-share check this week?',
      chatSeed: 'Help us set a fair-share rule and private envelopes.',
      href: '/family',
    })
  }

  return tips.slice(0, 3)
}
