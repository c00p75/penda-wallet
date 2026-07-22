import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import type { FinancialMission, FinancialMissionInput, MissionStatus } from './types'
import type { SuggestedMission } from './suggestMissions'

// supabase.functions.invoke collapses any non-2xx into a FunctionsHttpError
// whose .message is generic; the server's real copy (rate-limit 429, the
// not_enough_data / generation_failed sentinels) sits in the response body.
// Unwrap it so callers can branch on the sentinel and the UI can show the
// actual message. Mirrors features/chat/api.ts.
async function unwrapFunctionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: unknown; message?: unknown }
      const message = typeof body.error === 'string' ? body.error : body.message
      if (typeof message === 'string' && message) return new Error(message)
    } catch {
      /* body wasn't JSON, fall through to the original error */
    }
  }
  return error instanceof Error ? error : new Error(String(error))
}

export async function fetchMissions(walletId: string): Promise<FinancialMission[]> {
  const { data, error } = await supabase
    .from('financial_missions')
    .select('*')
    .eq('wallet_id', walletId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function createMission(
  walletId: string,
  userId: string,
  input: FinancialMissionInput,
): Promise<FinancialMission> {
  const { data, error } = await supabase
    .from('financial_missions')
    .insert({
      wallet_id: walletId,
      created_by: userId,
      title: input.title,
      description: input.description ?? null,
      start_date: input.start_date,
      end_date: input.end_date,
      status: input.status ?? 'active',
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function updateMissionStatus(id: string, status: MissionStatus): Promise<FinancialMission> {
  const { data, error } = await supabase
    .from('financial_missions')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function deleteMission(id: string): Promise<void> {
  const { error } = await supabase.from('financial_missions').delete().eq('id', id)
  if (error) throw error
}

/**
 * Ask the generate-mission-suggestions edge function for fresh, AI-written
 * missions grounded in this wallet's goals and spending history. Each call
 * produces new ideas (that's the point, vs. the old deterministic template),
 * and the server already avoids the wallet's active missions. Returns an empty
 * array when there isn't enough data yet or the model produced nothing usable,
 * so callers can fall back to the local starter ideas.
 */
export async function generateMissionSuggestions(walletId: string): Promise<SuggestedMission[]> {
  const { data, error } = await supabase.functions.invoke<{ suggestions?: SuggestedMission[] }>(
    'generate-mission-suggestions',
    { body: { walletId } },
  )

  if (error) {
    const unwrapped = await unwrapFunctionError(error)
    // These two are "no AI result, use your fallback" signals, not real
    // failures, let the caller degrade quietly instead of surfacing them.
    if (unwrapped.message === 'not_enough_data' || unwrapped.message === 'generation_failed') {
      return []
    }
    throw unwrapped
  }

  return data?.suggestions ?? []
}
