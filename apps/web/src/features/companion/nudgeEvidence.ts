/**
 * Explain *why* a proactive nudge fired, builds trust faster than more autonomy.
 */

export interface NudgeEvidence {
  insightId: string
  summary: string
  bullets: string[]
}

export function evidenceForInsight(
  insightId: string,
  ctx: {
    currency?: string
    categoryName?: string
    weeklySpendMinor?: number
    baselineWeeklyMinor?: number
    goalName?: string
    goalPct?: number
    merchant?: string
    repeatCount?: number
  } = {},
): NudgeEvidence {
  if (insightId.startsWith('opportunity:underspend')) {
    return {
      insightId,
      summary: 'Based on your spending this week vs the prior four weeks.',
      bullets: [
        ctx.weeklySpendMinor != null && ctx.baselineWeeklyMinor != null
          ? `This week vs usual weekly pace (${ctx.weeklySpendMinor} vs ~${Math.round(ctx.baselineWeeklyMinor)} minor units).`
          : 'This week’s spend was well below your recent weekly average.',
        ctx.goalName
          ? `Suggested parking what still remains toward “${ctx.goalName}” (only when balance can cover it).`
          : 'No open goal, suggested stashing what still remains (only when balance can cover it).',
      ],
    }
  }

  if (insightId.startsWith('observability:')) {
    return {
      insightId,
      summary: 'A spending pattern without a matching budget.',
      bullets: [
        ctx.categoryName
          ? `Category “${ctx.categoryName}” shows a clear monthly average.`
          : 'An unbudgeted category crossed the suggestion threshold.',
        'Budgets help Penda pace the rest of the month with you.',
      ],
    }
  }

  if (insightId.startsWith('celebration:')) {
    return {
      insightId,
      summary: 'Goal progress crossed a celebration threshold.',
      bullets: [
        ctx.goalName
          ? `“${ctx.goalName}” is ${ctx.goalPct != null ? `${Math.round(ctx.goalPct * 100)}%` : 'nearly'} funded.`
          : 'A savings goal is nearly or fully funded.',
      ],
    }
  }

  if (insightId.startsWith('ghost:')) {
    return {
      insightId,
      summary: 'Repeated small leaks or fees in your ledger.',
      bullets: [
        ctx.merchant ? `Pattern around “${ctx.merchant}”.` : 'Tiny repeated sends or fees stood out.',
        ctx.repeatCount != null ? `Seen about ${ctx.repeatCount} times recently.` : 'Detected from recent transactions.',
      ],
    }
  }

  if (insightId.startsWith('pact-follow:')) {
    return {
      insightId,
      summary: 'A commitment pact hit a check-in moment.',
      bullets: ['Penda follows up at the midpoint, end, or when a pact breaks, so promises don’t fade quietly.'],
    }
  }

  if (insightId.startsWith('payday:')) {
    return {
      insightId,
      summary: 'Your income cadence put you near payday.',
      bullets: ['Inferred from recent income dates and/or recurring income rules.'],
    }
  }

  if (insightId.startsWith('family-')) {
    return {
      insightId,
      summary: 'Household / couple plan signal.',
      bullets: ['Allowances, fair-share, and settle-up balances from your family or couple hub.'],
    }
  }

  if (insightId.startsWith('weekly-letter')) {
    return {
      insightId,
      summary: 'Your persona’s weekly narrative recap.',
      bullets: ['Built from this week’s income, spend, top category, and one next move.'],
    }
  }

  if (insightId.startsWith('radar:')) {
    return {
      insightId,
      summary: 'Bill and obligation radar for the next fortnight.',
      bullets: [
        'Pulls active recurring bills/income and debts with due dates in the window.',
        'Crunch date is the soonest outflow so you can protect cash before it hits.',
      ],
    }
  }

  if (insightId.startsWith('protect-weekend:')) {
    return {
      insightId,
      summary: 'Weekend protect autopilot.',
      bullets: [
        'Suggested Thu/Fri when a cash-light Fri–Sun window helps.',
        'Daily cap is ~65% of your safe-to-spend-per-day so fun doesn’t crowd essentials.',
      ],
    }
  }

  if (insightId.startsWith('life-event:')) {
    return {
      insightId,
      summary: 'Active life-event mode on your profile.',
      bullets: ['Temporary coaching tone for travel, job change, newborn, wedding, or other.'],
    }
  }

  if (
    insightId.startsWith('price:') ||
    insightId.startsWith('quiet:') ||
    insightId.startsWith('sub:')
  ) {
    return {
      insightId,
      summary: 'Merchant / subscription pattern from your ledger.',
      bullets: [
        ctx.merchant
          ? `Signal around “${ctx.merchant}”.`
          : 'Grouped by merchant name across recent expenses.',
        'Looks for monthly-ish repeats, price jumps, and quiet unused subs.',
      ],
    }
  }

  if (insightId === 'safe-to-spend') {
    return {
      insightId,
      summary: 'Safe-to-spend from your spending limit minus spend and fixed costs.',
      bullets: ['Tap again after updating the plan or logging spend to refresh the breakdown.'],
    }
  }

  return {
    insightId,
    summary: 'Triggered by your recent money activity and preferences.',
    bullets: ['Open chat if you want the full story.'],
  }
}
