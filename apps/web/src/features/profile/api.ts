import { supabase } from '@/lib/supabase/client'
import type { Profile, ProfileInput } from './types'

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error) throw error
  return data as unknown as Profile
}

export async function updateProfile(userId: string, input: ProfileInput): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(input)
    .eq('id', userId)
    .select('*')
    .single()

  if (error) throw error
  return data as unknown as Profile
}
