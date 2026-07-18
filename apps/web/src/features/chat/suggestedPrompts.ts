import { currencySymbol } from '@/lib/currencies'
import type { PageContext } from './pageContext'

export type PromptSeed = {
  label: string
  /** When true, send immediately on tap. */
  autoSend?: boolean
}

/**
 * Screen-aware empty-state prompts so chat feels like a companion that already
 * knows where the user is, not a generic chatbot.
 */
export function suggestedPromptsFor(
  pageContext: PageContext | undefined,
  currency = 'USD',
): PromptSeed[] {
  const sym = currencySymbol(currency)

  switch (pageContext?.page) {
    case 'budgets':
      return [
        { label: 'How are my budgets doing?', autoSend: true },
        { label: 'Help me rebalance this month', autoSend: true },
        { label: 'What should I cut first?', autoSend: true },
      ]
    case 'goals':
    case 'goal-detail':
      return [
        { label: 'Am I on track for my goals?', autoSend: true },
        { label: 'What should I do next on this goal?', autoSend: true },
        { label: 'Help me save more this month', autoSend: true },
      ]
    case 'cashflow':
      return [
        { label: 'When will I run short?', autoSend: true },
        { label: 'How much free before payday?', autoSend: true },
        { label: 'What if I cut spending by 20%?', autoSend: true },
      ]
    case 'analytics':
      return [
        { label: 'What did I spend this week?', autoSend: true },
        { label: 'Where is my money going?', autoSend: true },
        { label: 'Any ghost leaks I should know about?', autoSend: true },
      ]
    case 'ledger':
      return [
        { label: `I spent ${sym}`, autoSend: false },
        { label: 'Categorize my recent purchases', autoSend: true },
        { label: 'Always categorize Uber as Transport', autoSend: true },
      ]
    case 'journal':
      return [
        { label: 'What do you remember about me?', autoSend: true },
        { label: 'Summarize my money story this month', autoSend: true },
      ]
    case 'simulator':
      return [
        { label: 'What if rent went up 10%?', autoSend: true },
        { label: 'Can I afford a big purchase?', autoSend: true },
      ]
    case 'business':
      return [
        { label: 'How is my side hustle doing?', autoSend: true },
        { label: 'What should I set aside for tax?', autoSend: true },
      ]
    case 'family':
      return [
        { label: 'How is the household plan looking?', autoSend: true },
        { label: 'Who do I need to settle up with?', autoSend: true },
      ]
    case 'home':
    default:
      return [
        { label: `I spent ${sym}`, autoSend: false },
        { label: 'What did I spend this week?', autoSend: true },
        { label: 'How are my budgets doing?', autoSend: true },
        { label: 'Always categorize Uber as Transport', autoSend: true },
      ]
  }
}
