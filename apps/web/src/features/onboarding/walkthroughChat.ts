import { currencySymbol } from '@/lib/currencies'
import { formatMoney } from '@/lib/money'
import { GOAL_OPTIONS, type PrimaryGoal } from '@/features/profile/onboardingOptions'
import {
  personalityMeta,
  resolveAiPersonality,
  type AiPersonality,
} from '@/features/profile/types'

/**
 * Penda-speaks-first openers for the onboarding walkthrough. Each one does the
 * same three jobs: sell (why Penda is worth it), guide (exactly what to say
 * next, with an example), and ask for the one piece of data that step needs.
 * They render instantly as local assistant bubbles, so the first impression
 * never waits on a model round-trip, then the user's reply is handled live.
 *
 * Keep the voice warm and plain. Never use the em dash character.
 */

export interface WalkthroughBudgetLine {
  label: string
  amount: number
}

export interface LogOpenerInput {
  personality: AiPersonality | string
  goals: PrimaryGoal[]
  currency: string
}

/** Short in-character beat before the shared "just talk" pitch. */
function personaVoiceBeat(personality: AiPersonality | string): string {
  switch (resolveAiPersonality(personality)) {
    case 'drill_sergeant':
      return 'I keep it blunt and keep you moving.'
    case 'analyst':
      return 'I stick to the numbers and cut the fluff.'
    case 'hustler':
      return 'I care about growth, earning more, not just spending less.'
    case 'angry_mom':
      return "I'll love you and still call out the takeout habit."
    case 'funny_comedian':
      return "I'll crack jokes, and still get the point across."
    case 'balanced_coach':
    default:
      return "I'm warm, steady, and here to keep you on track."
  }
}

function goalsPhrase(goals: PrimaryGoal[]): string | null {
  if (goals.length === 0) return null
  const labels = goals.map((g) => {
    const meta = GOAL_OPTIONS.find((o) => o.value === g)
    return (meta?.label ?? g).replace(/^Just /, '').replace(/\.$/, '')
  })
  if (labels.length === 1) return labels[0]!
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`
}

/** Step 1 of the chat: welcome, sell the "just talk to me" promise, log a purchase. */
export function buildLogOpener(input: LogOpenerInput): string {
  const { goals, currency } = input
  const persona = personalityMeta(input.personality)
  const sym = currencySymbol(currency)
  const goalLine = goalsPhrase(goals)
  const goalBeat = goalLine
    ? ` You said you want to ${goalLine.toLowerCase()}. I'll keep that in mind.`
    : ''

  return (
    `Hi, I'm ${persona.name}, your money companion inside Penda. ${personaVoiceBeat(input.personality)}` +
    `${goalBeat} Here's the whole idea: ` +
    `you just talk to me like a friend, and I keep your money organized behind the scenes. ` +
    `No spreadsheets, no forms, no receipts to file. Let's try it right now. ` +
    `Tell me one thing you spent recently, like "coffee ${sym}4" or "groceries ${sym}60", ` +
    `and I'll sort the category, the date, and start tracking your balance for you.`
  )
}

/** Step 2 of the chat: celebrate the first log, sell trust, ask for the real balance. */
export function buildBalanceOpener(currency: string): string {
  const sym = currencySymbol(currency)
  return (
    `Nice, that's logged and categorized already. Easier than a spreadsheet, right? ` +
    `Now the one number that makes everything else trustworthy: how much do you actually ` +
    `have right now, across cash, bank, and mobile money together? ` +
    `Just tell me the total, like "${sym}1,200" or "about 350". ` +
    `I'll lock it in as your starting balance so your safe-to-spend is always real, not a guess.`
  )
}

/** Step 3 of the chat: present the seeded plan, invite tweaks, ask for income + payday. */
export function buildPlanOpener(budgets: WalkthroughBudgetLine[], currency: string): string {
  const askIncome =
    `If you tell me roughly what you earn in a typical month and what day you usually get paid, ` +
    `I'll shape the plan around your payday.`

  if (budgets.length === 0) {
    return (
      `I've set up a starter plan for you on the Plan tab. It's just a starting point, ` +
      `and I'll keep reshaping it as I learn how you really spend. ${askIncome} ` +
      `When it looks right, just say "looks good".`
    )
  }

  const list = budgets.map((b) => `${b.label} ${formatMoney(b.amount, currency)}`).join(', ')
  return (
    `Based on your goals, I drafted you a starter plan: ${list}. ` +
    `It's a starting point, and I'll reshape it as I learn how you really spend. ` +
    `Want to change any of these? ${askIncome} ` +
    `When it looks right, just say "looks good".`
  )
}
