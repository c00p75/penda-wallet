import { supabase } from '@/lib/supabase/client'

export type RuleMatchType = 'merchant_contains' | 'description_contains'

export interface CategorizationRuleInput {
  match_type: RuleMatchType
  match_value: string
  category_id: string
}

/** Upsert a Teach-Penda rule: same wallet + match_type + match_value → update category. */
export async function upsertCategorizationRule(
  walletId: string,
  input: CategorizationRuleInput,
): Promise<void> {
  const matchValue = input.match_value.trim()
  if (!matchValue) return

  const { data: existing, error: selectError } = await supabase
    .from('categorization_rules')
    .select('id')
    .eq('wallet_id', walletId)
    .eq('match_type', input.match_type)
    .eq('match_value', matchValue)
    .maybeSingle()
  if (selectError) throw selectError

  if (existing) {
    const { error } = await supabase
      .from('categorization_rules')
      .update({ category_id: input.category_id })
      .eq('id', existing.id)
    if (error) throw error
    return
  }

  const { error } = await supabase.from('categorization_rules').insert({
    wallet_id: walletId,
    match_type: input.match_type,
    match_value: matchValue,
    category_id: input.category_id,
  })
  if (error) throw error
}
