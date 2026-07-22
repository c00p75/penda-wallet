import { createBudget } from '@/features/budgets/api'
import { starterBudgetsForPersona } from '@/features/budgets/starterBudgets'
import { fetchCategories } from '@/features/categories/api'
import { createDebt } from '@/features/debts/api'
import { createSavingsGoal } from '@/features/goals/api'
import { upsertSpendingPlan } from '@/features/planning/api'
import type { AiPersonality } from '@/features/profile/types'
import type { IncomeRange, PrimaryGoal } from '@/features/profile/onboardingOptions'
import { starterGoalFromPrimary } from '@/features/profile/starterFromGoal'
import { localMonthStart } from '@/lib/dates'

/** Soft monthly plan amounts (minor units) from onboarding income vibe. */
export function intendedAmountFromIncome(incomeRange: IncomeRange | null): number {
  switch (incomeRange) {
    case 'tight':
      return 800_000
    case 'comfortable':
      return 2_500_000
    case 'stable':
      return 1_500_000
    default:
      return 1_200_000
  }
}

/**
 * Best-effort seed after wallet create: spending plan, persona budgets,
 * savings goal and/or debt placeholder from the primary goal pick.
 */
export async function seedWalletFromOnboarding(input: {
  walletId: string
  userId: string
  primaryGoals: PrimaryGoal[]
  incomeRange: IncomeRange | null
  persona?: AiPersonality | null
}): Promise<void> {
  const month = localMonthStart()
  const intended = intendedAmountFromIncome(input.incomeRange)
  const persona = input.persona ?? 'balanced_coach'

  await upsertSpendingPlan(input.walletId, input.userId, {
    month,
    intended_amount_minor: intended,
    reflection: null,
  })

  const categories = await fetchCategories(input.walletId)
  const suggestions = starterBudgetsForPersona(persona, intended, categories)
  for (const s of suggestions) {
    await createBudget(input.walletId, {
      category_id: s.categoryId,
      amount_minor: s.suggestedAmountMinor,
      period: 'monthly',
      rollover: false,
    })
  }

  // Seed a starter savings goal for each picked goal that maps to one.
  for (const goal of input.primaryGoals) {
    const starterGoal = starterGoalFromPrimary(goal)
    if (starterGoal) {
      await createSavingsGoal(input.walletId, starterGoal, 0)
    }
  }

  if (input.primaryGoals.includes('pay_off_debt')) {
    await createDebt(input.walletId, {
      name: 'Debt payoff',
      direction: 'i_owe',
      counterparty: null,
      principal_minor: 500_000,
      interest_rate: null,
      due_date: null,
    })
  }
}
