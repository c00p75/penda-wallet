import { supabase } from '@/lib/supabase/client'
import type { Category } from './types'

export async function fetchCategories(walletId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .or(`wallet_id.eq.${walletId},wallet_id.is.null`)
    .order('name')

  if (error) throw error
  return data
}
