import { supabase } from '@/lib/supabase/client'

/** Schedule the signed-in user's account for deletion after a 30-day grace period. */
export async function deleteAccount(): Promise<{ scheduledDeletionAt: string }> {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: {} })
  if (error) throw error
  return data
}

/** Cancel a pending deletion scheduled by deleteAccount(). */
export async function restoreAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('restore-account', { body: {} })
  if (error) throw error
}

/** Skip the grace period and irreversibly delete the account and all its data now. */
export async function confirmAccountDeletion(): Promise<void> {
  const { error } = await supabase.functions.invoke('confirm-account-deletion', { body: {} })
  if (error) throw error
}
