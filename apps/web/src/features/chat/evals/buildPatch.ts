/**
 * Offline mirror of chat-message buildPatch / staging guards.
 * Documents how model-facing fields map onto DB columns.
 */

export type FieldKind = 'minor' | 'category' | 'raw'

export type FieldCfg = { column: string; kind: FieldKind }

export type DomainFieldMap = Record<string, FieldCfg>

export const DOMAIN_FIELDS: Record<string, DomainFieldMap> = {
  transaction: {
    amount: { column: 'amount_minor', kind: 'minor' },
    type: { column: 'type', kind: 'raw' },
    category: { column: 'category_id', kind: 'category' },
    merchant: { column: 'merchant', kind: 'raw' },
    description: { column: 'description', kind: 'raw' },
    transaction_date: { column: 'transaction_date', kind: 'raw' },
  },
  debt: {
    name: { column: 'name', kind: 'raw' },
    direction: { column: 'direction', kind: 'raw' },
    counterparty: { column: 'counterparty', kind: 'raw' },
    amount: { column: 'principal_minor', kind: 'minor' },
    due_date: { column: 'due_date', kind: 'raw' },
  },
  budget: {
    amount: { column: 'amount_minor', kind: 'minor' },
    period: { column: 'period', kind: 'raw' },
    category: { column: 'category_id', kind: 'category' },
    rollover: { column: 'rollover', kind: 'raw' },
  },
  goal: {
    name: { column: 'name', kind: 'raw' },
    target_amount: { column: 'target_amount_minor', kind: 'minor' },
    current_amount: { column: 'current_amount_minor', kind: 'minor' },
    target_date: { column: 'target_date', kind: 'raw' },
  },
  category: {
    name: { column: 'name', kind: 'raw' },
    icon: { column: 'icon', kind: 'raw' },
  },
  wallet: {
    name: { column: 'name', kind: 'raw' },
  },
}

export type CategoryRef = { id: string; name: string }

export function buildPatch(
  domain: string,
  row: Record<string, unknown>,
  changes: Record<string, unknown>,
  categories: CategoryRef[],
): { patch: Record<string, unknown>; diffKeys: string[] } {
  const fields = DOMAIN_FIELDS[domain]
  if (!fields) throw new Error(`Unknown domain "${domain}".`)

  const patch: Record<string, unknown> = {}
  const diffKeys: string[] = []

  for (const [key, raw] of Object.entries(changes)) {
    const field = fields[key]
    if (!field) continue

    let value: unknown
    if (field.kind === 'minor') {
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) throw new Error(`"${key}" must be a non-negative number.`)
      value = Math.round(n * 100)
    } else if (field.kind === 'category') {
      const match = categories.find((c) => c.name.toLowerCase() === String(raw).toLowerCase())
      if (!match) throw new Error(`No category named "${raw}".`)
      value = match.id
    } else {
      value = raw === '' ? null : raw
    }

    if (row[field.column] === value) continue
    patch[field.column] = value
    diffKeys.push(key)
  }

  return { patch, diffKeys }
}

/** PostgREST .or() search sanitizer mirrored from chat-message. */
export function sanitizeSearch(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim()
}

export function categoryGuardMessage(row: {
  is_system?: boolean
  wallet_id?: string | null
}): string | null {
  if (row.is_system || row.wallet_id === null) {
    return 'That is a built-in default category and cannot be changed or removed.'
  }
  return null
}
