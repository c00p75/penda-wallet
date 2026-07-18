import { formatMoney } from '@/lib/money'

export interface WeeklyLetterStats {
  currency: string
  personaName: string
  incomeMinor: number
  expenseMinor: number
  topCategoryName?: string | null
  topCategoryMinor?: number | null
  /** One leak or overspend line, if any. */
  leakLine?: string | null
  /** One win line (goal progress, underspend, kept pact). */
  winLine?: string | null
  /** Concrete next move. */
  nextMove?: string | null
  periodStart: string
  periodEnd: string
}

export interface WeeklyLetter {
  title: string
  body: string
  /** Short card teaser for the home carousel. */
  teaser: string
  chatSeed: string
}

/**
 * Narrative weekly letter, not another insight card. Pure draft the edge
 * function can send as-is or polish with an LLM later.
 */
export function buildWeeklyLetter(stats: WeeklyLetterStats): WeeklyLetter {
  const net = stats.incomeMinor - stats.expenseMinor
  const netLabel = formatMoney(Math.abs(net), stats.currency)
  const spent = formatMoney(stats.expenseMinor, stats.currency)
  const earned = formatMoney(stats.incomeMinor, stats.currency)

  const netSentence =
    net >= 0
      ? `You came out ~${netLabel} ahead (${earned} in, ${spent} out).`
      : `This week ran ~${netLabel} short (${earned} in, ${spent} out).`

  const categoryLine =
    stats.topCategoryName && stats.topCategoryMinor != null && stats.topCategoryMinor > 0
      ? `Biggest slice: ${stats.topCategoryName} at ${formatMoney(stats.topCategoryMinor, stats.currency)}.`
      : null

  const parts = [
    `Hey. ${stats.personaName} here with your week (${stats.periodStart} → ${stats.periodEnd}).`,
    netSentence,
    categoryLine,
    stats.winLine ? `What went well: ${stats.winLine}` : null,
    stats.leakLine ? `One leak to watch: ${stats.leakLine}` : null,
    stats.nextMove ? `One next move: ${stats.nextMove}` : 'One next move: open chat if you want to plan the week ahead.',
  ].filter(Boolean) as string[]

  const body = parts.join(' ')
  const teaser =
    net >= 0
      ? `${stats.personaName} wrote your week: ~${netLabel} ahead.`
      : `${stats.personaName} wrote your week: ~${netLabel} short, with one next move.`

  return {
    title: `A note from ${stats.personaName}`,
    body,
    teaser,
    chatSeed: `I read your weekly letter. ${stats.nextMove ?? 'Help me plan this week.'}`,
  }
}
