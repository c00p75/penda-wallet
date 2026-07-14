import { supabase } from '@/lib/supabase/client'
import type { Category, CategoryInput } from './types'

export async function fetchCategories(walletId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .or(`wallet_id.eq.${walletId},wallet_id.is.null`)
    .order('name')

  if (error) throw error
  return data
}

export async function createCategory(walletId: string, input: CategoryInput): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({ wallet_id: walletId, ...input })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function updateCategory(id: string, input: CategoryInput): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .update(input)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw error
}
