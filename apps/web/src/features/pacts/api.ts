import { supabase } from '@/lib/supabase/client'
import type { CommitmentPact, CommitmentPactInput } from './types'

export async function fetchPacts(walletId: string): Promise<CommitmentPact[]> {
  const { data, error } = await supabase
    .from('commitment_pacts')
    .select('*')
    .eq('wallet_id', walletId)
    .order('end_date', { ascending: false })

  if (error) throw error
  return data
}

export async function createPact(
  walletId: string,
  userId: string,
  input: CommitmentPactInput,
): Promise<CommitmentPact> {
  const { data, error } = await supabase
    .from('commitment_pacts')
    .insert({ wallet_id: walletId, created_by: userId, ...input })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function deletePact(id: string): Promise<void> {
  const { error } = await supabase.from('commitment_pacts').delete().eq('id', id)
  if (error) throw error
}
