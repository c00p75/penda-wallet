import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

/** Allowlists kept in sync with chat-message CRUD_DOMAINS / confirm-ai-action. */
export const DOMAIN_TABLES: Record<
  string,
  { table: string; softDelete: boolean; deletable: boolean; columns: string[] }
> = {
  transaction: {
    table: 'transactions',
    softDelete: true,
    deletable: true,
    columns: ['amount_minor', 'type', 'category_id', 'merchant', 'description', 'transaction_date'],
  },
  debt: {
    table: 'debts',
    softDelete: false,
    deletable: true,
    columns: ['name', 'direction', 'counterparty', 'principal_minor', 'due_date'],
  },
  budget: {
    table: 'budgets',
    softDelete: false,
    deletable: true,
    columns: ['amount_minor', 'period', 'category_id', 'rollover'],
  },
  goal: {
    table: 'savings_goals',
    softDelete: false,
    deletable: true,
    columns: ['name', 'target_amount_minor', 'current_amount_minor', 'target_date'],
  },
  category: { table: 'categories', softDelete: false, deletable: true, columns: ['name', 'icon'] },
  wallet: { table: 'wallets', softDelete: false, deletable: false, columns: ['name'] },
}

export interface PendingActionRow {
  id: string
  kind: 'update' | 'delete'
  domain: string
  target_id: string
  patch: Record<string, unknown> | null
  summary: string
  status: string
}

export async function executePendingAction(
  supabase: SupabaseClient,
  action: PendingActionRow,
): Promise<void> {
  const target = DOMAIN_TABLES[action.domain]
  if (!target) throw new Error(`Unknown domain "${action.domain}".`)

  if (action.kind === 'update') {
    const patch = action.patch ?? {}
    const safePatch = Object.fromEntries(
      Object.entries(patch).filter(([column]) => target.columns.includes(column)),
    )
    if (Object.keys(safePatch).length === 0) throw new Error('Nothing to update.')
    const { error } = await supabase.from(target.table).update(safePatch).eq('id', action.target_id)
    if (error) throw error
    return
  }

  if (!target.deletable) throw new Error(`Deleting a ${action.domain} isn't allowed.`)
  if (target.softDelete) {
    const { error } = await supabase
      .from(target.table)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', action.target_id)
    if (error) throw error
  } else {
    const { error } = await supabase.from(target.table).delete().eq('id', action.target_id)
    if (error) throw error
  }
}
