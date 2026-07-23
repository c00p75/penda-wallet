import { supabase } from '@/lib/supabase/client'
import type { FeatureVisit } from './types'

export async function fetchFeatureVisits(walletId: string): Promise<FeatureVisit[]> {
  const { data, error } = await supabase
    .from('feature_visits')
    .select('*')
    .eq('wallet_id', walletId)

  if (error) throw error
  return data
}

/**
 * Upserts without `first_visited_at` so the column default sets it once on
 * insert and stays untouched on every later visit to the same page.
 */
export async function recordFeatureVisit(
  walletId: string,
  userId: string,
  page: string,
): Promise<void> {
  const { error } = await supabase.from('feature_visits').upsert(
    {
      wallet_id: walletId,
      user_id: userId,
      page,
      last_visited_at: new Date().toISOString(),
    },
    { onConflict: 'wallet_id,page' },
  )
  if (error) throw error
}
