import { supabase } from '@/lib/supabase/client'
import type { Entitlement } from './types'

export async function fetchEntitlement(userId: string): Promise<Entitlement> {
  const { data, error } = await supabase.from('entitlements').select('*').eq('user_id', userId).single()
  if (error) throw error
  return data as unknown as Entitlement
}
