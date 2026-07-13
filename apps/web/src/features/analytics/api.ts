import { supabase } from '@/lib/supabase/client'
import type { Insight } from './types'

export async function fetchInsights(walletId: string): Promise<Insight[]> {
  const { data, error } = await supabase
    .from('ai_insights')
    .select('*')
    .eq('wallet_id', walletId)
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as unknown as Insight[]
}

export async function dismissInsight(id: string): Promise<void> {
  const { error } = await supabase
    .from('ai_insights')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}
