export interface CategorizationRuleLike {
  match_type: 'merchant_contains' | 'description_contains'
  match_value: string
  category_id: string
  category_name?: string
}

export interface TeachBackMatch {
  rule: CategorizationRuleLike
  field: 'merchant' | 'description'
  matchedText: string
  message: string
  /** Ask once per rule+day. */
  dedupeKey: string
}

/**
 * After a rule auto-categorizes a transaction, confirm it still matches the
 * user's intent ("Logged as Transport per your rule. Still right?").
 */
export function matchTeachBack(opts: {
  merchant?: string | null
  description?: string | null
  categoryId?: string | null
  categoryName?: string | null
  rules: CategorizationRuleLike[]
  /** ISO date for dedupe (YYYY-MM-DD). */
  day: string
  /** Rules already confirmed today, skip re-ask. */
  confirmedKeys?: Set<string>
}): TeachBackMatch | null {
  const merchant = opts.merchant?.trim() ?? ''
  const description = opts.description?.trim() ?? ''

  for (const rule of opts.rules) {
    const needle = rule.match_value.trim().toLowerCase()
    if (!needle) continue

    let field: 'merchant' | 'description' | null = null
    let matchedText = ''
    if (rule.match_type === 'merchant_contains' && merchant.toLowerCase().includes(needle)) {
      field = 'merchant'
      matchedText = merchant
    } else if (
      rule.match_type === 'description_contains' &&
      description.toLowerCase().includes(needle)
    ) {
      field = 'description'
      matchedText = description
    }
    if (!field) continue

    // Only teach-back when the rule actually drove the category (or category matches).
    if (opts.categoryId && rule.category_id && opts.categoryId !== rule.category_id) continue

    const cat = rule.category_name ?? opts.categoryName ?? 'that category'
    const dedupeKey = `teach-back:${rule.match_type}:${needle}:${opts.day}`
    if (opts.confirmedKeys?.has(dedupeKey)) continue

    return {
      rule,
      field,
      matchedText,
      message: `Logged as ${cat} per your “${rule.match_value}” rule. Still right?`,
      dedupeKey,
    }
  }

  return null
}

export type TeachBackReply = 'yes' | 'no'

export function parseTeachBackReply(text: string): TeachBackReply | null {
  const t = text.trim().toLowerCase()
  if (/^(yes|yep|yeah|still right|correct|ok|okay)\b/.test(t)) return 'yes'
  if (/^(no|nope|wrong|change|fix)\b/.test(t)) return 'no'
  return null
}
