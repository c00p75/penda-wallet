import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Database } from './database.types.ts'

/** System category for reconcile / set_balance balancing entries. */
export const BALANCE_ADJUSTMENT_CATEGORY_NAME = 'Balance adjustment'

/** Resolve the global system category id used for balance reconciliation deltas. */
export async function fetchBalanceAdjustmentCategoryId(
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .eq('name', BALANCE_ADJUSTMENT_CATEGORY_NAME)
    .eq('is_system', true)
    .is('wallet_id', null)
    .maybeSingle()
  if (error) throw error
  return data?.id ?? null
}
