import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface AiTrust {
  confirmed_ok: number
  confirmed_undone: number
  auto_loose: boolean
}

export interface AiConsent {
  auto_log_sms: boolean
  act_without_confirm: boolean
  parse_clipboard: boolean
  unprompted_coaching: boolean
}

export const DEFAULT_AI_TRUST: AiTrust = {
  confirmed_ok: 0,
  confirmed_undone: 0,
  auto_loose: false,
}

export const GRADUATE_THRESHOLD = 10

export function normalizeAiTrust(raw: unknown): AiTrust {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AI_TRUST }
  const o = raw as Record<string, unknown>
  return {
    confirmed_ok: Math.max(0, Number(o.confirmed_ok) || 0),
    confirmed_undone: Math.max(0, Number(o.confirmed_undone) || 0),
    auto_loose: Boolean(o.auto_loose),
  }
}

export function normalizeAiConsent(raw: unknown): AiConsent {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    auto_log_sms: o.auto_log_sms !== false,
    act_without_confirm: Boolean(o.act_without_confirm),
    parse_clipboard: o.parse_clipboard !== false,
    unprompted_coaching: o.unprompted_coaching !== false,
  }
}

/** Manual consent or graduated auto_loose, skip Yes/No card. */
export function mayActWithoutConfirm(consent: AiConsent, trust: AiTrust): boolean {
  return consent.act_without_confirm || trust.auto_loose
}

export function withSuccessfulConfirm(trust: AiTrust): { trust: AiTrust; graduated: boolean } {
  const next: AiTrust = {
    ...trust,
    confirmed_ok: trust.confirmed_ok + 1,
  }
  const graduated =
    !next.auto_loose && next.confirmed_ok >= GRADUATE_THRESHOLD && next.confirmed_undone === 0
  if (graduated) next.auto_loose = true
  return { trust: next, graduated }
}

export function withUndo(trust: AiTrust): AiTrust {
  return {
    confirmed_ok: trust.confirmed_ok,
    confirmed_undone: trust.confirmed_undone + 1,
    auto_loose: false,
  }
}

export async function loadConsentAndTrust(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ consent: AiConsent; trust: AiTrust }> {
  const { data } = await supabase
    .from('profiles')
    .select('ai_consent, ai_trust')
    .eq('id', userId)
    .maybeSingle()
  return {
    consent: normalizeAiConsent(data?.ai_consent),
    trust: normalizeAiTrust(data?.ai_trust),
  }
}

export async function persistTrustAfterConfirm(
  supabase: SupabaseClient,
  userId: string,
  consent: AiConsent,
  trust: AiTrust,
): Promise<void> {
  const { trust: next, graduated } = withSuccessfulConfirm(trust)
  const patch: Record<string, unknown> = { ai_trust: next }
  if (graduated) {
    patch.ai_consent = { ...consent, act_without_confirm: true }
  }
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
  if (error) console.error('persistTrustAfterConfirm', error.message)
}

export async function persistTrustAfterUndo(
  supabase: SupabaseClient,
  userId: string,
  consent: AiConsent,
  trust: AiTrust,
): Promise<void> {
  const next = withUndo(trust)
  const { error } = await supabase
    .from('profiles')
    .update({
      ai_trust: next,
      ai_consent: { ...consent, act_without_confirm: false },
    })
    .eq('id', userId)
  if (error) console.error('persistTrustAfterUndo', error.message)
}
