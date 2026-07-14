import { supabase } from '@/lib/supabase/client'
import type { AiMemory, AiMemoryInput } from './types'

export async function fetchMemories(userId: string): Promise<AiMemory[]> {
  const { data, error } = await supabase
    .from('ai_memories')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function createMemory(userId: string, input: AiMemoryInput): Promise<AiMemory> {
  const { data, error } = await supabase
    .from('ai_memories')
    .insert({ user_id: userId, ...input })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function deleteMemory(id: string): Promise<void> {
  const { error } = await supabase.from('ai_memories').delete().eq('id', id)
  if (error) throw error
}
