import { supabase } from '@/lib/supabase/client'

/** Irreversibly delete the signed-in user's account and all their data. */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { body: {} })
  if (error) throw error
}
