import { formatMoney } from '@/lib/money'

/** Seed message for the plan walkthrough step (auto-sent once on first open). */
export function buildPlanChatSeed(
  budgetPreview: { label: string; amount: number }[],
  currency: string,
): string {
  if (budgetPreview.length === 0) {
    return 'I drafted a starter plan for you on the Plan tab. Reply "looks good" or tell me what to tweak.'
  }
  return `I drafted your starter plan: ${budgetPreview
    .map((b) => `${b.label} ${formatMoney(b.amount, currency)}`)
    .join(', ')}. Reply "looks good" or tell me what to tweak.`
}
