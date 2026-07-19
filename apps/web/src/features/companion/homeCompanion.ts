import type { InsightCard } from '@/features/coaching/InsightCarousel'
import type { CommitmentPact } from '@/features/pacts/types'
import type { Transaction } from '@/features/transactions/types'
import type { SavingsGoal } from '@/features/goals/types'
import type { AiMemory } from '@/features/memory/types'
import type { RecurringTransaction } from '@/features/recurring/types'
import { buildContinuityOpener } from './continuity'
import type { CompanionPrefs } from './companionPrefs'
import { detectFamilyCompanionTips } from './familyCompanion'
import { recentMoodTone, applyMoodToCoachingText } from './moodCoaching'
import { detectPactFollowUps, impulseDueForFollowUp } from './pactFollowUp'
import { walletBalanceMinor } from '@/features/planning/walletBalance'
import { buildPaydayMessage, inferPaydayCadence, paydayPhase } from './paydayCycle'
import { shouldQuietNudge } from './quietMode'
import type { PausedImpulse } from '@/features/impulse/impulseStore'
import { buildObligationRadar, radarCoachingLine } from '@/features/radar/obligationRadar'
import { buildProtectWeekendPlan } from '@/features/radar/protectWeekend'
import { detectMerchantSignals } from '@/features/merchants/subscriptionBrain'
import { lifeEventActive, lifeEventCoachingLine, type LifeEvent } from '@/features/lifeEvents/types'
import type { DebtDueLike } from '@/features/radar/obligationRadar'

export interface CompanionHomeInput {
  prefs: CompanionPrefs
  mode: string
  currency: string
  personaName: string
  memories: AiMemory[]
  pacts: CommitmentPact[]
  transactions: Transaction[]
  goals: SavingsGoal[]
  recurring: RecurringTransaction[]
  pausedImpulses: PausedImpulse[]
  freeBeforeNextIncomeMinor?: number | null
  settleBalances?: Array<{ name: string; netMinor: number }>
  weeklyLetterTeaser?: string | null
  debts?: DebtDueLike[]
  lifeEvent?: LifeEvent | null
  safeDailyMinor?: number | null
  now?: Date
}

export interface CompanionHomeResult {
  cards: InsightCard[]
  quiet: boolean
  moodTone: ReturnType<typeof recentMoodTone>
  continuitySeed: string | null
}

/**
 * Build companion-specific home cards (pact / payday / family / letter) and
 * apply quiet + mood gating. Action handlers are attached by the caller.
 */
export function buildCompanionHomeSignals(
  input: CompanionHomeInput,
  actions: {
    openChat: (seed?: string, opts?: { autoSend?: boolean }) => void
    navigate: (path: string) => void
    openWhy: (insightId: string) => void
  },
): CompanionHomeResult {
  const now = input.now ?? new Date()
  const moodTone = recentMoodTone(input.memories, { now })
  const quiet = shouldQuietNudge({ prefs: input.prefs, now, recentMood: moodTone })

  const continuitySeed = buildContinuityOpener({
    memories: input.memories,
    activePacts: input.pacts
      .filter((p) => p.end_date >= now.toISOString().slice(0, 10))
      .map((p) => ({ description: p.description, end_date: p.end_date })),
    personaName: input.personaName,
    enabled: input.prefs.continuity_openers,
    daysSinceLastOpen: null,
  })

  if (quiet) {
    return { cards: [], quiet: true, moodTone, continuitySeed }
  }

  const cards: InsightCard[] = []

  if (input.prefs.pact_follow_up) {
    for (const f of detectPactFollowUps({
      pacts: input.pacts,
      transactions: input.transactions,
      now,
    })) {
      cards.push({
        id: f.dedupeKey,
        variant: 'tip',
        tone: f.kind === 'broken' ? 'default' : 'warm',
        label: 'Check-in:',
        text: applyMoodToCoachingText(f.message, moodTone),
        action: {
          label: 'Talk about it',
          onTap: () => actions.openChat(f.message, { autoSend: true }),
        },
      })
    }

    for (const f of impulseDueForFollowUp(input.pausedImpulses, now.getTime())) {
      cards.push({
        id: f.dedupeKey,
        variant: 'tip',
        tone: 'default',
        label: 'Check-in:',
        text: applyMoodToCoachingText(f.message, moodTone),
        action: {
          label: 'Open chat',
          onTap: () => actions.openChat(f.message, { autoSend: true }),
        },
      })
    }
  }

  if (input.prefs.payday_companion) {
    const income = input.transactions
      .filter((t) => t.type === 'income')
      .map((t) => ({
        transaction_date: t.transaction_date,
        amount_minor: t.converted_amount_minor ?? t.amount_minor,
      }))
    const nextRecurring = input.recurring
      .filter((r) => r.is_active && r.template.type === 'income')
      .map((r) => r.next_run_date)
      .sort()[0]
    const cadence = inferPaydayCadence(income, {
      now,
      recurringNextIncome: nextRecurring ?? null,
    })
    const phase = paydayPhase(cadence.nextPayday, now)
    if (phase) {
      const msg = buildPaydayMessage({
        phase,
        currency: input.currency,
        freeBeforePaydayMinor: input.freeBeforeNextIncomeMinor,
        typicalAmountMinor: cadence.typicalAmountMinor,
        availableBalanceMinor: walletBalanceMinor(input.transactions),
      })
      cards.push({
        id: `payday:${phase}:${cadence.nextPayday}`,
        variant: 'tip',
        tone: 'warm',
        label: `${msg.title}:`,
        text: applyMoodToCoachingText(msg.body, moodTone),
        action:
          phase === 'day' || phase === 'post'
            ? {
                label: 'Salary plan',
                onTap: () => actions.navigate('/radar'),
              }
            : {
                label: 'Plan with AI',
                onTap: () => actions.openChat(msg.chatSeed, { autoSend: true }),
              },
      })
    }
  }

  if (input.prefs.family_nudges) {
    const allowances = input.goals.filter((g) => /allowance|pocket|kids?/i.test(g.name))
    for (const tip of detectFamilyCompanionTips({
      mode: input.mode,
      currency: input.currency,
      allowances,
      settleBalances: input.settleBalances,
      enabled: true,
    })) {
      const couple = input.mode === 'couple'
      cards.push({
        id: tip.id,
        variant: 'tip',
        tone: 'default',
        label: couple ? 'Couple:' : 'Family:',
        text: applyMoodToCoachingText(tip.text, moodTone),
        action: {
          label:
            tip.href === '/settle-up' ? 'Settle up' : couple ? 'Couple hub' : 'Family hub',
          onTap: () => actions.navigate(tip.href),
        },
      })
    }
  }

  if (input.prefs.weekly_letter && input.weeklyLetterTeaser) {
    cards.push({
      id: 'weekly-letter',
      variant: 'read',
      tone: 'warm',
      label: 'Letter:',
      text: input.weeklyLetterTeaser,
      action: {
        label: 'Read with AI',
        onTap: () =>
          actions.openChat('I want to talk about my weekly letter.', { autoSend: true }),
      },
    })
  }

  const today = now.toISOString().slice(0, 10)
  if (lifeEventActive(input.lifeEvent ?? null, today) && input.lifeEvent) {
    const line = lifeEventCoachingLine(input.lifeEvent)
    cards.push({
      id: `life-event:${input.lifeEvent.kind}`,
      variant: 'tip',
      tone: 'warm',
      label: 'Life moment:',
      text: applyMoodToCoachingText(line, moodTone),
      action: {
        label: 'Talk it through',
        onTap: () => actions.openChat(line, { autoSend: true }),
      },
    })
  }

  const radar = buildObligationRadar({
    recurring: input.recurring,
    debts: input.debts,
    days: 14,
    now,
  })
  if (radar.outflowTotalMinor > 0) {
    const line = radarCoachingLine(radar, input.currency)
    cards.push({
      id: `radar:${radar.crunchDate ?? today}`,
      variant: 'tip',
      tone: radar.netPressureMinor < 0 ? 'default' : 'warm',
      label: 'Radar:',
      text: applyMoodToCoachingText(line, moodTone),
      action: {
        label: 'Open radar',
        onTap: () => actions.navigate('/radar'),
      },
    })
  }

  const dow = now.getDay()
  if (dow === 4 || dow === 5) {
    const protect = buildProtectWeekendPlan({
      safeToSpendDailyMinor: input.safeDailyMinor ?? 0,
      currency: input.currency,
      now,
    })
    cards.push({
      id: `protect-weekend:${protect.startDate}`,
      variant: 'tip',
      tone: 'warm',
      label: 'Weekend:',
      text: applyMoodToCoachingText(
        `${protect.description} Cap ~${Math.round(protect.dailyCapMinor / 100)}/day.`,
        moodTone,
      ),
      action: {
        label: 'Protect weekend',
        onTap: () => actions.navigate('/radar'),
      },
    })
  }

  const merchant = detectMerchantSignals(input.transactions, { now })[0]
  if (merchant) {
    cards.push({
      id: merchant.id,
      variant: 'tip',
      tone: merchant.kind === 'quiet_sub' ? 'default' : 'warm',
      label: 'Merchant:',
      text: applyMoodToCoachingText(merchant.summary, moodTone),
      action: {
        label: 'Review',
        onTap: () => actions.navigate('/radar'),
      },
    })
  }

  // Attach a secondary "why?" via id. HomePage wraps cards for Why sheet.
  void actions.openWhy

  return { cards, quiet: false, moodTone, continuitySeed }
}
