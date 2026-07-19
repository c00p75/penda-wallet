/**
 * Pure undo / allowlist helpers mirrored from
 * supabase/functions/_shared/executePendingAction.ts and chat-message staging.
 * Keep column lists in sync with the edge function execute path.
 */

export type UndoDomain =
  | 'transaction'
  | 'debt'
  | 'budget'
  | 'goal'
  | 'category'
  | 'wallet'

export type DomainTableCfg = {
  table: string
  softDelete: boolean
  /** False for wallets: AI may rename, never delete. */
  deletable: boolean
  /** Columns executePendingAction may write on update. */
  updateColumns: string[]
  /**
   * Extra columns allowed when reinserting a hard-deleted row from __before
   * (ownership keys the update allowlist never touches).
   */
  reinsertColumns: string[]
}

/** Execute + undo domain map. updateColumns must match edge DOMAIN_TABLES.columns. */
export const DOMAIN_TABLES: Record<UndoDomain, DomainTableCfg> = {
  transaction: {
    table: 'transactions',
    softDelete: true,
    deletable: true,
    updateColumns: [
      'amount_minor',
      'type',
      'category_id',
      'merchant',
      'description',
      'transaction_date',
    ],
    reinsertColumns: [
      'amount_minor',
      'type',
      'category_id',
      'merchant',
      'description',
      'transaction_date',
      'wallet_id',
      'currency',
      'created_by',
    ],
  },
  debt: {
    table: 'debts',
    softDelete: false,
    deletable: true,
    updateColumns: ['name', 'direction', 'counterparty', 'principal_minor', 'due_date'],
    reinsertColumns: [
      'name',
      'direction',
      'counterparty',
      'principal_minor',
      'balance_minor',
      'due_date',
      'wallet_id',
      'interest_rate',
    ],
  },
  budget: {
    table: 'budgets',
    softDelete: false,
    deletable: true,
    updateColumns: ['amount_minor', 'period', 'category_id', 'rollover'],
    reinsertColumns: ['amount_minor', 'period', 'category_id', 'rollover', 'wallet_id'],
  },
  goal: {
    table: 'savings_goals',
    softDelete: false,
    deletable: true,
    updateColumns: ['name', 'target_amount_minor', 'current_amount_minor', 'target_date'],
    reinsertColumns: [
      'name',
      'target_amount_minor',
      'current_amount_minor',
      'target_date',
      'wallet_id',
      'icon',
      'motivation',
      'image_path',
    ],
  },
  category: {
    table: 'categories',
    softDelete: false,
    deletable: true,
    updateColumns: ['name', 'icon'],
    reinsertColumns: ['name', 'icon', 'wallet_id'],
  },
  wallet: {
    table: 'wallets',
    softDelete: false,
    deletable: false,
    updateColumns: ['name'],
    reinsertColumns: ['name'],
  },
}

export function isUndoDomain(domain: string): domain is UndoDomain {
  return Object.prototype.hasOwnProperty.call(DOMAIN_TABLES, domain)
}

/** Strip __before and any non-allowlisted keys before applying an update. */
export function filterUpdatePatch(
  domain: string,
  patch: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!isUndoDomain(domain)) throw new Error(`Unknown domain "${domain}".`)
  const allowed = new Set(DOMAIN_TABLES[domain].updateColumns)
  const src = patch ?? {}
  return Object.fromEntries(
    Object.entries(src).filter(([column]) => allowed.has(column) && column !== '__before'),
  )
}

/** Restore patch for an update undo from the staged __before snapshot. */
export function filterRestorePatch(
  domain: string,
  before: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return filterUpdatePatch(domain, before)
}

/**
 * Build a row for hard-delete undo reinsert. Drops join/computed junk and
 * unknown columns so PostgREST does not reject the insert.
 */
export function buildReinsertRow(
  domain: string,
  targetId: string,
  before: Record<string, unknown>,
): Record<string, unknown> {
  if (!isUndoDomain(domain)) throw new Error(`Unknown domain "${domain}".`)
  const cfg = DOMAIN_TABLES[domain]
  if (!cfg.deletable) throw new Error(`Deleting a ${domain} isn't allowed.`)
  if (cfg.softDelete) {
    throw new Error(`Domain "${domain}" uses soft-delete restore, not reinsert.`)
  }
  const allowed = new Set(cfg.reinsertColumns)
  const row: Record<string, unknown> = { id: targetId }
  for (const [key, value] of Object.entries(before)) {
    if (key === 'id' || key === 'category' || key === 'deleted_at') continue
    if (value !== null && typeof value === 'object') continue
    if (allowed.has(key)) row[key] = value
  }
  return row
}

export type UndoActionLike = {
  status: string
  kind: 'update' | 'delete'
  domain: string
  patch: Record<string, unknown> | null
}

/** Whether a resolved AI action can be undone from the AI actions page. */
export function canUndoAiAction(action: UndoActionLike): boolean {
  if (action.status !== 'confirmed' && action.status !== 'auto_applied') return false
  if (!isUndoDomain(action.domain)) return false
  const cfg = DOMAIN_TABLES[action.domain]
  const before = action.patch?.__before
  const hasBefore = !!before && typeof before === 'object' && !Array.isArray(before)

  if (action.kind === 'delete') {
    if (!cfg.deletable) return false
    // Soft-deleted transactions can restore without a snapshot.
    if (cfg.softDelete) return true
    return hasBefore
  }

  return hasBefore
}

/** Snapshot of pre-image fields for an update (only keys present in the patch). */
export function buildBeforeSnapshot(
  row: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const before: Record<string, unknown> = {}
  for (const key of Object.keys(patch)) {
    if (key === '__before') continue
    before[key] = row[key]
  }
  return before
}
