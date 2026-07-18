import { supabase } from '@/lib/supabase/client'
import type { CompanionPrefs } from './companionPrefs'

export type CheckinKind = 'pact' | 'impulse' | 'payday' | 'teach_back' | 'weekly_letter' | 'family'
export type CheckinStatus = 'pending' | 'kept' | 'slipped' | 'dismissed' | 'answered'

export interface CompanionCheckin {
  id: string
  user_id: string
  wallet_id: string
  kind: CheckinKind
  ref_id: string | null
  message: string
  status: CheckinStatus
  due_at: string
  created_at: string
  responded_at: string | null
  payload: Record<string, unknown>
}

export async function fetchPendingCheckins(walletId: string): Promise<CompanionCheckin[]> {
  const { data, error } = await supabase
    .from('companion_checkins')
    .select('*')
    .eq('wallet_id', walletId)
    .eq('status', 'pending')
    .lte('due_at', new Date().toISOString())
    .order('due_at', { ascending: true })
    .limit(10)
  if (error) throw error
  return (data ?? []) as CompanionCheckin[]
}

export async function respondToCheckin(
  id: string,
  status: Exclude<CheckinStatus, 'pending'>,
): Promise<void> {
  const { error } = await supabase
    .from('companion_checkins')
    .update({ status, responded_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function fetchLatestWeeklyLetter(
  walletId: string,
): Promise<{ id: string; title: string; body: string; created_at: string } | null> {
  const { data, error } = await supabase
    .from('companion_letters')
    .select('id, title, body, created_at')
    .eq('wallet_id', walletId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function updateCompanionPrefs(
  userId: string,
  prefs: CompanionPrefs,
): Promise<CompanionPrefs> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ companion_prefs: prefs })
    .eq('id', userId)
    .select('companion_prefs')
    .single()
  if (error) throw error
  return data.companion_prefs as CompanionPrefs
}
