/**
 * Deterministic life-milestone suggestions from profile, life-event, spend,
 * and existing goals. Used by chat (prompt injection) and the Goals page.
 *
 * Keep in sync with packages/money-core/src/suggestMilestones.ts
 */

export type MilestoneId =
  | 'emergency_fund'
  | 'move_out'
  | 'bigger_home'
  | 'buy_car'
  | 'start_business'
  | 'education'
  | 'wedding'
  | 'newborn'
  | 'travel'
  | 'debt_freedom'

export interface MilestoneCatalogEntry {
  id: MilestoneId
  label: string
  icon: string
  /** Short reason template when no better signal-specific reason exists. */
  why: string
}

export const MILESTONE_CATALOG: readonly MilestoneCatalogEntry[] = [
  {
    id: 'emergency_fund',
    label: 'Emergency buffer',
    icon: '🛡️',
    why: 'A cushion for surprises keeps the rest of the plan steady.',
  },
  {
    id: 'move_out',
    label: 'Move out / first place',
    icon: '🏠',
    why: 'A deposit and setup costs are easier when you name the goal.',
  },
  {
    id: 'bigger_home',
    label: 'Bigger / better home',
    icon: '🏡',
    why: 'Housing upgrades need a clear target and a monthly pace.',
  },
  {
    id: 'buy_car',
    label: 'Buy a car',
    icon: '🚗',
    why: 'Transport spend often points to saving for your own wheels.',
  },
  {
    id: 'start_business',
    label: 'Start or grow a business',
    icon: '💼',
    why: 'Side hustles and small businesses need a dedicated kitty.',
  },
  {
    id: 'education',
    label: 'School / training fees',
    icon: '🎓',
    why: 'Fees land in lumps. Saving ahead beats scrambling.',
  },
  {
    id: 'wedding',
    label: 'Wedding / celebration',
    icon: '💍',
    why: 'One clear celebration goal beats scattered little expenses.',
  },
  {
    id: 'newborn',
    label: 'Baby / newborn costs',
    icon: '👶',
    why: 'Essentials add up fast. A named buffer helps.',
  },
  {
    id: 'travel',
    label: 'Big trip',
    icon: '✈️',
    why: 'Trips are more fun when the money is already set aside.',
  },
  {
    id: 'debt_freedom',
    label: 'Pay off debt',
    icon: '💰',
    why: 'A payoff target makes every payment feel like progress.',
  },
] as const

const BY_ID = Object.fromEntries(MILESTONE_CATALOG.map((m) => [m.id, m])) as Record<
  MilestoneId,
  MilestoneCatalogEntry
>

export interface CategorySpendSignal {
  categoryName: string
  totalMinor: number
}

export interface SuggestMilestonesInput {
  mode?: string | null
  primaryGoals?: readonly string[]
  incomeRange?: string | null
  householdSize?: number | null
  /** Active life_event.kind when present. */
  lifeEventKind?: string | null
  existingGoalNames?: readonly string[]
  categorySpend?: readonly CategorySpendSignal[]
  /** Lowercased merchants + descriptions for keyword matching. */
  textBlob?: string | null
  hasOpenDebt?: boolean
  /** Max suggestions to return. Default 4. */
  max?: number
}

export interface MilestoneSuggestion {
  id: MilestoneId
  label: string
  reason: string
  suggestedIcon: string
  /** 0–1 ranking score. */
  confidence: number
}

type Scored = { id: MilestoneId; confidence: number; reason: string }

const GOAL_MATCH: Record<MilestoneId, RegExp> = {
  emergency_fund: /\b(emergency|buffer|rainy\s*day|cushion)\b/i,
  move_out: /\b(move\s*out|first\s*(place|home|apartment|flat)|deposit|rent)\b/i,
  bigger_home: /\b(bigger|better|new)\s*(house|home|place)|house\s*deposit|mortgage\b/i,
  buy_car: /\b(car|vehicle|wheels|motorbike|bike)\b/i,
  start_business: /\b(business|hustle|shop|stock|inventory|startup)\b/i,
  education: /\b(school|fees|tuition|university|college|training|course)\b/i,
  wedding: /\b(wedding|marriage|bride|groom|dowry)\b/i,
  newborn: /\b(baby|newborn|infant|napp|diaper|maternity)\b/i,
  travel: /\b(travel|trip|holiday|vacation|flight|ticket)\b/i,
  debt_freedom: /\b(debt|loan|owe|pay\s*off|clear)\b/i,
}

function alreadyCovered(id: MilestoneId, existingNames: readonly string[]): boolean {
  const re = GOAL_MATCH[id]
  return existingNames.some((n) => re.test(n))
}

function categoryShare(
  spend: readonly CategorySpendSignal[],
  nameRe: RegExp,
): { share: number; total: number; matched: number } {
  let total = 0
  let matched = 0
  for (const row of spend) {
    if (row.totalMinor <= 0) continue
    total += row.totalMinor
    if (nameRe.test(row.categoryName)) matched += row.totalMinor
  }
  return { share: total > 0 ? matched / total : 0, total, matched }
}

function bump(map: Map<MilestoneId, Scored>, id: MilestoneId, confidence: number, reason: string) {
  const prev = map.get(id)
  if (!prev || confidence > prev.confidence) {
    map.set(id, { id, confidence, reason })
  } else if (prev && confidence === prev.confidence && reason.length > prev.reason.length) {
    map.set(id, { id, confidence, reason })
  }
}

/**
 * Rank life-milestone ideas for planning. Pure and deterministic.
 */
export function suggestMilestones(input: SuggestMilestonesInput = {}): MilestoneSuggestion[] {
  const max = input.max ?? 4
  const mode = (input.mode ?? 'individual').toLowerCase()
  const primaryGoals = input.primaryGoals ?? []
  const existing = input.existingGoalNames ?? []
  const spend = input.categorySpend ?? []
  const blob = (input.textBlob ?? '').toLowerCase()
  const life = (input.lifeEventKind ?? '').toLowerCase()
  const scored = new Map<MilestoneId, Scored>()

  // Life event season → matching milestone.
  if (life === 'wedding') {
    bump(scored, 'wedding', 0.95, 'You marked a wedding window. A celebration goal keeps spend intentional.')
  } else if (life === 'newborn') {
    bump(scored, 'newborn', 0.95, 'Newborn season: a dedicated essentials buffer helps.')
  } else if (life === 'travel') {
    bump(scored, 'travel', 0.9, 'Travel mode is on. A trip goal keeps home bills and fun separate.')
  } else if (life === 'job_change') {
    bump(scored, 'emergency_fund', 0.85, 'Job changes are smoother with a thicker buffer first.')
  }

  // Onboarding primary goals.
  if (primaryGoals.includes('build_emergency_fund')) {
    bump(scored, 'emergency_fund', 0.88, 'You said building an emergency fund is a priority.')
  }
  if (primaryGoals.includes('pay_off_debt') || input.hasOpenDebt) {
    bump(
      scored,
      'debt_freedom',
      input.hasOpenDebt ? 0.9 : 0.8,
      input.hasOpenDebt
        ? 'You have open debt. A payoff target makes progress visible.'
        : 'You said paying off debt is a priority.',
    )
  }
  if (primaryGoals.includes('save_for_something')) {
    // Soft nudge toward a concrete life milestone when they want "something".
    if (mode === 'business') {
      bump(scored, 'start_business', 0.55, 'You want to save for something specific. A business kitty fits this account.')
    } else if (mode === 'family') {
      bump(scored, 'education', 0.5, 'You want to save for something specific. School fees are a common family milestone.')
    } else {
      bump(scored, 'move_out', 0.5, 'You want to save for something specific. Moving out is a common next step.')
    }
  }

  // Mode framing.
  if (mode === 'business') {
    bump(scored, 'start_business', 0.75, 'This is a business account. A growth or tax-buffer goal fits.')
  } else if (mode === 'family') {
    bump(scored, 'education', 0.55, 'Family accounts often need a school or fees goal.')
    if ((input.householdSize ?? 0) >= 3) {
      bump(scored, 'bigger_home', 0.5, 'A larger household sometimes points to more space.')
    }
  } else if (mode === 'couple') {
    bump(scored, 'travel', 0.45, 'Couples often plan a shared trip or celebration.')
  }

  // Spend category shares.
  const housing = categoryShare(spend, /hous/i)
  const transport = categoryShare(spend, /transport/i)
  const shopping = categoryShare(spend, /shop/i)

  if (housing.share >= 0.28 && housing.matched > 0) {
    if (mode === 'individual') {
      bump(
        scored,
        'move_out',
        Math.min(0.92, 0.55 + housing.share),
        'Housing is a big slice of spend. A move-out or first-place goal may fit.',
      )
    } else {
      bump(
        scored,
        'bigger_home',
        Math.min(0.9, 0.5 + housing.share),
        'Housing takes a large share. Saving toward a better place could help.',
      )
    }
  }

  if (transport.share >= 0.18 && transport.matched > 0) {
    bump(
      scored,
      'buy_car',
      Math.min(0.88, 0.5 + transport.share),
      'Transport spend is high. A car (or bike) savings goal may cut long-term costs.',
    )
  }

  // Keyword blob from merchants / notes.
  if (/\b(rent|landlord|deposit|hostel)\b/.test(blob)) {
    bump(scored, 'move_out', 0.7, 'Rent and housing words show up in your spend. A place of your own is a natural goal.')
  }
  if (/\b(school|tuition|fees|university|college)\b/.test(blob)) {
    bump(scored, 'education', 0.78, 'School or fees show up in your spending. Save ahead for the next lump.')
  }
  if (/\b(fuel|petrol|diesel|uber|bolt|taxi|kombi)\b/.test(blob) && transport.share >= 0.1) {
    bump(scored, 'buy_car', 0.65, 'Lots of ride and fuel spend. Owning transport could be worth planning for.')
  }
  if (/\b(wedding|bride|groom)\b/.test(blob)) {
    bump(scored, 'wedding', 0.8, 'Wedding-related spend shows up. A celebration goal keeps it contained.')
  }
  if (/\b(baby|newborn|napp|diaper|formula)\b/.test(blob)) {
    bump(scored, 'newborn', 0.8, 'Baby-related spend shows up. An essentials buffer helps.')
  }
  if (/\b(flight|airline|hotel|airbnb|holiday|vacation)\b/.test(blob)) {
    bump(scored, 'travel', 0.7, 'Travel spend shows up. A trip fund makes the next one intentional.')
  }
  if (/\b(stock|inventory|supplier|wholesale|shoprite\s*wholesale)\b/.test(blob) || shopping.share >= 0.35) {
    if (mode === 'business') {
      bump(scored, 'start_business', 0.7, 'Business-like spend patterns suggest a growth or stock fund.')
    }
  }

  // Tight income → emergency buffer bias.
  if (input.incomeRange === 'tight') {
    bump(scored, 'emergency_fund', 0.7, 'When money is tight, a small buffer is the highest-leverage goal.')
  }

  // Cold-start soft defaults so chat always has something to offer.
  if (scored.size === 0) {
    bump(scored, 'emergency_fund', 0.4, 'A small emergency buffer is a solid first milestone.')
    if (mode === 'business') {
      bump(scored, 'start_business', 0.35, 'A business growth fund is a natural next milestone.')
    } else if (mode === 'family') {
      bump(scored, 'education', 0.35, 'School or training fees are a common family milestone.')
    } else {
      bump(scored, 'move_out', 0.35, 'Moving out or a first place is a common life milestone.')
    }
  } else if (![...scored.keys()].includes('emergency_fund') && !alreadyCovered('emergency_fund', existing)) {
    // Keep buffer as a soft option when signals point elsewhere.
    bump(scored, 'emergency_fund', 0.35, 'Worth keeping an emergency buffer alongside bigger milestones.')
  }

  const ranked = [...scored.values()]
    .filter((s) => !alreadyCovered(s.id, existing))
    .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))
    .slice(0, max)

  // If everything was suppressed by existing goals, still offer uncovered catalog defaults.
  if (ranked.length === 0) {
    const fallbacks: MilestoneId[] =
      mode === 'business'
        ? ['emergency_fund', 'start_business', 'travel']
        : mode === 'family'
          ? ['emergency_fund', 'education', 'bigger_home']
          : ['emergency_fund', 'move_out', 'buy_car', 'travel']
    for (const id of fallbacks) {
      if (alreadyCovered(id, existing)) continue
      const entry = BY_ID[id]
      ranked.push({ id, confidence: 0.3, reason: entry.why })
      if (ranked.length >= max) break
    }
  }

  return ranked.map((s) => {
    const entry = BY_ID[s.id]
    return {
      id: s.id,
      label: entry.label,
      reason: s.reason,
      suggestedIcon: entry.icon,
      confidence: s.confidence,
    }
  })
}

/** Format suggestions for injection into the chat system prompt. */
export function formatMilestoneSuggestionsForPrompt(
  suggestions: readonly MilestoneSuggestion[],
): string {
  if (suggestions.length === 0) return ''
  const lines = suggestions.map(
    (s, i) => `${i + 1}. ${s.label} (${s.id}): ${s.reason} Suggested icon: ${s.suggestedIcon}.`,
  )
  return (
    `\n\nLife-milestone ideas grounded in their profile and spending (offer these when planning; ` +
    `do not invent dollar targets without asking or using income facts they saved in memory):\n` +
    lines.join('\n')
  )
}
