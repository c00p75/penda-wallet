import { supabase } from '@/src/lib/supabase';
import type { AiMemory, AiMemoryInput } from '@/src/api/types';

export async function fetchMemories(userId: string): Promise<AiMemory[]> {
  const { data, error } = await supabase
    .from('ai_memories')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as AiMemory[];
}

export async function createMemory(userId: string, input: AiMemoryInput): Promise<AiMemory> {
  const { data, error } = await supabase
    .from('ai_memories')
    .insert({ user_id: userId, ...input })
    .select('*')
    .single();

  if (error) throw error;
  return data as AiMemory;
}

export async function deleteMemory(id: string): Promise<void> {
  const { error } = await supabase.from('ai_memories').delete().eq('id', id);
  if (error) throw error;
}
