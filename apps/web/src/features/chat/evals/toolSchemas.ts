/**
 * Offline mirrors of chat-message tool schemas. Used as a golden harness so
 * staged / proposed tool args stay valid without calling the model.
 */

export const TOOL_NAMES = [
  'create_transaction',
  'create_debt',
  'log_borrowed_or_lent_money',
  'create_budget',
  'create_goal',
  'create_category',
  'query_records',
  'get_spending_summary',
  'update_record',
  'delete_record',
  'save_memory',
  'teach_categorization',
] as const

export type ToolName = (typeof TOOL_NAMES)[number]

/** Tools that stage a confirm card instead of applying immediately. */
export const STAGING_TOOLS = new Set<ToolName>(['update_record', 'delete_record'])

/** Tools that run immediately (lookups / memory / creates that may still confirm). */
export const IMMEDIATE_LOOKUP_TOOLS = new Set<ToolName>(['query_records', 'get_spending_summary'])

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export type ValidationIssue = { path: string; message: string }

export type ValidationResult = { ok: true } | { ok: false; issues: ValidationIssue[] }

function fail(path: string, message: string): ValidationResult {
  return { ok: false, issues: [{ path, message }] }
}

function requireString(args: Record<string, unknown>, key: string): ValidationResult | string {
  const v = args[key]
  if (typeof v !== 'string' || !v.trim()) return fail(key, 'required non-empty string')
  return v
}

function requireNumber(args: Record<string, unknown>, key: string): ValidationResult | number {
  const v = args[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) return fail(key, 'required finite number')
  return v
}

function optionalIsoDate(args: Record<string, unknown>, key: string): ValidationResult | null {
  if (args[key] == null) return null
  const v = args[key]
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return fail(key, 'must be YYYY-MM-DD')
  return null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Validate tool args against the same shape chat-message advertises to the model.
 * `categories` optionally constrains enum fields when provided.
 */
export function validateToolArgs(
  name: ToolName,
  args: unknown,
  opts: { categories?: string[] } = {},
): ValidationResult {
  if (!isRecord(args)) return fail('', 'args must be an object')
  const categories = opts.categories

  switch (name) {
    case 'create_transaction': {
      if (args.type !== 'expense' && args.type !== 'income') return fail('type', 'expense|income')
      const amount = requireNumber(args, 'amount')
      if (typeof amount !== 'number') return amount
      if (amount <= 0) return fail('amount', 'must be > 0')
      const category = requireString(args, 'category')
      if (typeof category !== 'string') return category
      if (categories && !categories.includes(category)) return fail('category', 'unknown category')
      const date = requireString(args, 'transaction_date')
      if (typeof date !== 'string') return date
      if (!ISO_DATE.test(date)) return fail('transaction_date', 'must be YYYY-MM-DD')
      return { ok: true }
    }
    case 'create_debt': {
      const n = requireString(args, 'name')
      if (typeof n !== 'string') return n
      if (args.direction !== 'i_owe' && args.direction !== 'owed_to_me') {
        return fail('direction', 'i_owe|owed_to_me')
      }
      const amount = requireNumber(args, 'amount')
      if (typeof amount !== 'number') return amount
      if (amount <= 0) return fail('amount', 'must be > 0')
      const due = optionalIsoDate(args, 'due_date')
      if (due && !due.ok) return due
      return { ok: true }
    }
    case 'log_borrowed_or_lent_money': {
      if (args.direction !== 'i_owe' && args.direction !== 'owed_to_me') {
        return fail('direction', 'i_owe|owed_to_me')
      }
      const amount = requireNumber(args, 'amount')
      if (typeof amount !== 'number') return amount
      if (amount <= 0) return fail('amount', 'must be > 0')
      const n = requireString(args, 'name')
      if (typeof n !== 'string') return n
      if (args.category != null) {
        if (typeof args.category !== 'string') return fail('category', 'must be string')
        if (categories && !categories.includes(args.category)) return fail('category', 'unknown category')
      }
      const due = optionalIsoDate(args, 'due_date')
      if (due && !due.ok) return due
      if (args.transaction_date != null) {
        if (typeof args.transaction_date !== 'string' || !ISO_DATE.test(args.transaction_date)) {
          return fail('transaction_date', 'must be YYYY-MM-DD')
        }
      }
      return { ok: true }
    }
    case 'create_budget': {
      const amount = requireNumber(args, 'amount')
      if (typeof amount !== 'number') return amount
      if (amount <= 0) return fail('amount', 'must be > 0')
      if (args.period !== 'weekly' && args.period !== 'monthly') return fail('period', 'weekly|monthly')
      if (args.category != null) {
        if (typeof args.category !== 'string') return fail('category', 'must be string')
        if (categories && !categories.includes(args.category)) return fail('category', 'unknown category')
      }
      return { ok: true }
    }
    case 'create_goal': {
      const n = requireString(args, 'name')
      if (typeof n !== 'string') return n
      const target = requireNumber(args, 'target_amount')
      if (typeof target !== 'number') return target
      if (target <= 0) return fail('target_amount', 'must be > 0')
      if (args.current_amount != null && typeof args.current_amount !== 'number') {
        return fail('current_amount', 'must be number')
      }
      const due = optionalIsoDate(args, 'target_date')
      if (due && !due.ok) return due
      return { ok: true }
    }
    case 'create_category': {
      const n = requireString(args, 'name')
      if (typeof n !== 'string') return n
      return { ok: true }
    }
    case 'query_records': {
      const domains = ['transaction', 'debt', 'budget', 'goal', 'category'] as const
      if (!domains.includes(args.domain as (typeof domains)[number])) {
        return fail('domain', domains.join('|'))
      }
      if (args.limit != null && (typeof args.limit !== 'number' || args.limit < 1)) {
        return fail('limit', 'must be >= 1')
      }
      for (const key of ['since', 'until'] as const) {
        if (args[key] != null && (typeof args[key] !== 'string' || !ISO_DATE.test(args[key] as string))) {
          return fail(key, 'must be YYYY-MM-DD')
        }
      }
      return { ok: true }
    }
    case 'get_spending_summary': {
      const since = requireString(args, 'since')
      if (typeof since !== 'string') return since
      if (!ISO_DATE.test(since)) return fail('since', 'must be YYYY-MM-DD')
      if (args.until != null && (typeof args.until !== 'string' || !ISO_DATE.test(args.until))) {
        return fail('until', 'must be YYYY-MM-DD')
      }
      return { ok: true }
    }
    case 'update_record': {
      const domains = ['transaction', 'debt', 'budget', 'goal', 'category', 'wallet'] as const
      if (!domains.includes(args.domain as (typeof domains)[number])) {
        return fail('domain', domains.join('|'))
      }
      const id = requireString(args, 'id')
      if (typeof id !== 'string') return id
      if (!isRecord(args.changes) || Object.keys(args.changes).length === 0) {
        return fail('changes', 'non-empty object required')
      }
      return { ok: true }
    }
    case 'delete_record': {
      const domains = ['transaction', 'debt', 'budget', 'goal', 'category'] as const
      if (!domains.includes(args.domain as (typeof domains)[number])) {
        return fail('domain', domains.join('|'))
      }
      const id = requireString(args, 'id')
      if (typeof id !== 'string') return id
      return { ok: true }
    }
    case 'save_memory': {
      const kinds = ['note', 'mood', 'preference', 'fact'] as const
      if (!kinds.includes(args.kind as (typeof kinds)[number])) return fail('kind', kinds.join('|'))
      const content = requireString(args, 'content')
      if (typeof content !== 'string') return content
      return { ok: true }
    }
    case 'teach_categorization': {
      const match = requireString(args, 'match_value')
      if (typeof match !== 'string') return match
      const category = requireString(args, 'category')
      if (typeof category !== 'string') return category
      if (categories && !categories.includes(category)) return fail('category', 'unknown category')
      if (
        args.match_type != null &&
        args.match_type !== 'merchant_contains' &&
        args.match_type !== 'description_contains'
      ) {
        return fail('match_type', 'merchant_contains|description_contains')
      }
      return { ok: true }
    }
    default:
      return fail('', `unknown tool ${(name as string) || '?'}`)
  }
}

/**
 * Mirror of chat-message `toolFailed`: trail rows mark failure from result text.
 */
export function toolResultLooksFailed(result: string, threw = false): boolean {
  if (threw) return true
  return /^(Failed|Tool "|Amount must|Debt amount|Budget amount|Goal target|A category|A memory|I can't|I need|Nothing to|Unknown tool|Deleting )/i.test(
    result,
  )
}

/**
 * Lightweight offline router: maps a user utterance to the tool a well-behaved
 * companion should prefer. Not a model stand-in; documents product intent for
 * goldens. Returns null when the utterance is chat-only / ambiguous.
 */
export function inferPreferredTool(utterance: string): ToolName | null {
  const u = utterance.trim().toLowerCase()
  if (!u) return null

  if (
    /\balways\s+categorize\b/.test(u) ||
    /\bcategorize\s+\w+\s+as\b/.test(u) ||
    /\bteach\s+penda\b/.test(u) ||
    /\bteach\b.*\bcategor/.test(u)
  ) {
    return 'teach_categorization'
  }
  if (
    (/\bremember\b|\bdon'?t\s+forget\b|\bi\s+(prefer|hate|love)\b/.test(u) ||
      /\bstress-buy/.test(u)) &&
    !/\b(spent|paid|bought)\b/.test(u)
  ) {
    return 'save_memory'
  }
  if (
    /\bhow\s+much\s+(did\s+i|have\s+i)\s+spend/.test(u) ||
    /\bspending\s+(this|last)\b/.test(u) ||
    /\btotal\s+spend/.test(u)
  ) {
    return 'get_spending_summary'
  }
  if (/\b(find|show|list|look\s+up)\b.*\b(transaction|debt|budget|goal|categor)/.test(u)) {
    return 'query_records'
  }
  if (/\bdelete\b|\bremove\b/.test(u) && /\b(transaction|debt|budget|goal|categor)/.test(u)) {
    return 'delete_record'
  }
  if (/\b(rename|change|update|edit|fix)\b/.test(u) && /\b(transaction|debt|budget|goal|categor|wallet)/.test(u)) {
    return 'update_record'
  }

  // Cash actually moved for a loan → atomic borrow/lend tool.
  const loanVerb = /\b(borrowed|lent)\b/.test(u) || /\bas a loan\b|\bloan\b/.test(u)
  const deniesCash = /\bno cash\b|\bcash (has )?not\b|\bnothing (paid|moved|exchanged)\b/.test(u)
  const cashMoved =
    !deniesCash && /\b(gave|got|received|sent|momo|airtel|handed)\b/.test(u)
  if (loanVerb && cashMoved) {
    return 'log_borrowed_or_lent_money'
  }

  // Promise / IOU with no cash movement. Skip "already paid" purchase phrasings.
  if (
    (/\b(iou|debt)\b/.test(u) || /\b(i\s+owe|owes?\s+me)\b/.test(u)) &&
    !cashMoved &&
    !/\balready\s+paid\b/.test(u) &&
    !/\b(spent|bought)\b/.test(u)
  ) {
    return 'create_debt'
  }

  if (/\b(budget|cap\s+my|limit\s+my)\b/.test(u) && !/\bhow\s+are\s+my\s+budgets\b/.test(u)) {
    return 'create_budget'
  }
  if (/\b(savings?\s+goal|save\s+for|goal\s+for)\b/.test(u)) {
    return 'create_goal'
  }
  if (/\b(new|create|add)\s+(a\s+)?categor/.test(u)) {
    return 'create_category'
  }
  if (
    /\b(spent|paid|bought|received|earned|got\s+paid|income|expense)\b/.test(u) ||
    /\bi\s+spent\b|\blog\b/.test(u)
  ) {
    return 'create_transaction'
  }
  return null
}
